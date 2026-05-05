// [Fix17] Orquestador del KDP Optimizer Pipeline.
// Corre en background tras crear/encontrar la fila kdp_metadata.
// Actualiza pipelineStatus + pipelineProgress según avanza.

import { storage } from "../storage";
import { kdpManuscriptAnalyzer, type ManuscriptAnalysis } from "../agents/kdp/manuscript-analyzer";
import { kdpMarketMetadataGenerator, type MarketMetadata } from "../agents/kdp/market-metadata";
import { kdpKeywordOptimizer } from "../agents/kdp/keyword-optimizer";
import { kdpSeoGenerator, type SeoMetadata } from "../agents/kdp/seo-generator";
import { kdpMarketingKitGenerator, type MarketingKit } from "../agents/kdp/marketing-kit";
import { kdpLandingContentGenerator, type LandingContent } from "../agents/kdp/landing-content";
import { KDP_MARKETS, findMarket, type KdpMarket } from "../utils/kdp-markets";
import { joinChaptersForSampling, sampleManuscript } from "../utils/manuscript-sampler";

export interface MarketEntry {
  marketId: string;
  marketName: string;
  locale: string;
  langCode: string;
  currency: string;
  domain: string;
  metadata: MarketMetadata;
  optimizedKeywords: string[];
  seo: SeoMetadata;
  generatedAt: string;
  error?: string;
}

export interface PipelineProgress {
  step: "queued" | "analyzing" | "metadata" | "marketing" | "landing" | "completed" | "failed";
  marketsTotal: number;
  marketsDone: number;
  currentMarket?: string;
  message?: string;
  error?: string;
}

interface RunPipelineParams {
  kdpMetadataId: number;
  projectId: number | null;
  reeditProjectId: number | null;
  selectedMarketIds: string[]; // subset of KDP_MARKETS ids
  primaryMarketId: string;     // which market populates the legacy columns
  pseudonymName?: string;
}

export async function runKdpPipeline(params: RunPipelineParams): Promise<void> {
  const { kdpMetadataId, projectId, reeditProjectId, selectedMarketIds, primaryMarketId, pseudonymName } = params;

  const setProgress = async (status: string, progress: PipelineProgress) => {
    await storage.updateKdpMetadata(kdpMetadataId, {
      pipelineStatus: status,
      pipelineProgress: progress,
    } as any);
  };

  try {
    // 1) Recoger contexto del libro y manuscrito
    let title = "";
    let genre = "fiction";
    let manuscriptText = "";
    let seriesName: string | null = null;
    let seriesNumber: number | null = null;
    let seriesDescription: string | null = null;
    let author = pseudonymName || "";

    if (projectId) {
      const project = await storage.getProject(projectId);
      if (!project) throw new Error("Proyecto no encontrado");
      title = project.title;
      genre = project.genre || "fiction";
      const chapters = await storage.getChaptersByProject(projectId);
      manuscriptText = joinChaptersForSampling(chapters as any);

      if (project.seriesId) {
        const s = await storage.getSeries(project.seriesId);
        if (s) {
          seriesName = s.title;
          seriesDescription = s.description || null;
          seriesNumber = (project as any).seriesOrder || null;
        }
      }
      if (!author && project.pseudonymId) {
        const pseudo = await storage.getPseudonym(project.pseudonymId);
        if (pseudo) author = pseudo.name;
      }
    } else if (reeditProjectId) {
      const reedit = await storage.getReeditProject(reeditProjectId);
      if (!reedit) throw new Error("Reedición no encontrada");
      title = reedit.title;
      genre = (reedit as any).genre || "fiction";
      const chapters = await storage.getReeditChaptersByProject(reeditProjectId);
      manuscriptText = joinChaptersForSampling(chapters.map(c => ({
        chapterNumber: c.chapterNumber,
        title: c.title,
        content: c.editedContent || c.originalContent,
      })));
      if (reedit.seriesId) {
        const s = await storage.getSeries(reedit.seriesId);
        if (s) {
          seriesName = s.title;
          seriesDescription = s.description || null;
          seriesNumber = (reedit as any).seriesOrder || null;
        }
      }
    } else {
      throw new Error("Falta projectId o reeditProjectId");
    }

    if (!manuscriptText || manuscriptText.trim().length < 500) {
      throw new Error("Manuscrito vacío o demasiado corto para analizar (mínimo 500 caracteres)");
    }

    // 2) PASO 1 — Análisis del manuscrito (compartido por todos los mercados)
    await setProgress("analyzing", {
      step: "analyzing",
      marketsTotal: selectedMarketIds.length,
      marketsDone: 0,
      message: "Analizando el manuscrito (muestreo estratégico)…",
    });

    const analysis: ManuscriptAnalysis = await kdpManuscriptAnalyzer.analyze({
      manuscriptText,
      language: "es", // analysis prompt is in English; locale only affects examples
      genre,
    });

    // Guardar análisis en cuanto esté listo
    await storage.updateKdpMetadata(kdpMetadataId, {
      manuscriptAnalysis: analysis as any,
    } as any);

    // 3) PASO 2 — Por cada mercado seleccionado: metadata + keywords + SEO
    const markets: KdpMarket[] = selectedMarketIds.map(id => findMarket(id)).filter((m): m is KdpMarket => !!m);
    if (markets.length === 0) throw new Error("Sin mercados válidos seleccionados");

    const marketEntries: MarketEntry[] = [];
    for (let i = 0; i < markets.length; i++) {
      const market = markets[i];
      await setProgress("metadata", {
        step: "metadata",
        marketsTotal: markets.length,
        marketsDone: i,
        currentMarket: market.id,
        message: `Generando metadata para ${market.name}…`,
      });

      try {
        const metadata = await kdpMarketMetadataGenerator.generate({
          originalTitle: title,
          market,
          genre,
          analysis,
          pseudonymName: author || undefined,
          seriesName: seriesName || undefined,
          seriesNumber: seriesNumber || undefined,
        });

        const optimizedKeywords = await kdpKeywordOptimizer.optimize({
          baseKeywords: [...metadata.keywords, ...analysis.seedKeywords].filter(Boolean).slice(0, 20),
          market,
          genre,
          titleAndSubtitle: `${metadata.title} ${metadata.subtitle}`.trim(),
        });

        const seo = await kdpSeoGenerator.generate({
          bookTitle: metadata.title,
          subtitle: metadata.subtitle,
          genre,
          themes: analysis.themes,
          description: metadata.description,
          market,
        });

        marketEntries.push({
          marketId: market.id,
          marketName: market.name,
          locale: market.locale,
          langCode: market.langCode,
          currency: market.currency,
          domain: market.domain,
          metadata,
          optimizedKeywords,
          seo,
          generatedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error(`[KdpPipeline] Mercado ${market.id} falló:`, err);
        marketEntries.push({
          marketId: market.id,
          marketName: market.name,
          locale: market.locale,
          langCode: market.langCode,
          currency: market.currency,
          domain: market.domain,
          metadata: { title, subtitle: "", description: "", keywords: ["","","","","","",""], categories: [] },
          optimizedKeywords: ["","","","","","",""],
          seo: { seoTitle: "", seoDescription: "", seoKeywords: [], ogTitle: "", ogDescription: "" },
          generatedAt: new Date().toISOString(),
          error: err?.message || String(err),
        });
      }

      // Persistir progreso parcial tras cada mercado
      await storage.updateKdpMetadata(kdpMetadataId, {
        marketEntries: marketEntries as any,
      } as any);
    }

    // [Fix17/review] Promoción segura: nunca promover un mercado con error.
    // Preferencia: primaryMarketId si OK → primer mercado OK → marcar pipeline failed/partial.
    const successful = marketEntries.filter(e => !e.error);
    const requestedPrimary = marketEntries.find(e => e.marketId === primaryMarketId);
    const primary = (requestedPrimary && !requestedPrimary.error) ? requestedPrimary : successful[0];
    const promotionFailed = !primary;
    const partialFailure = successful.length > 0 && successful.length < marketEntries.length;
    const primaryMarket = primary ? findMarket(primary.marketId) : findMarket(primaryMarketId);

    // 4) PASO 3 — Marketing kit (locale del mercado primario)
    await setProgress("marketing", {
      step: "marketing",
      marketsTotal: markets.length,
      marketsDone: markets.length,
      message: "Generando kit de marketing orgánico…",
    });

    let marketingKit: MarketingKit | null = null;
    try {
      marketingKit = await kdpMarketingKitGenerator.generate({
        title,
        genre,
        themes: analysis.themes,
        tropes: analysis.tropes,
        emotionalHooks: analysis.emotionalHooks,
        targetAudienceInsights: analysis.targetAudienceInsights,
        isFiction: analysis.isFiction,
        market: primaryMarket || markets[0],
      });
    } catch (err: any) {
      console.error("[KdpPipeline] Marketing kit falló:", err);
    }

    // 5) PASO 4 — Landing page content
    await setProgress("landing", {
      step: "landing",
      marketsTotal: markets.length,
      marketsDone: markets.length,
      message: "Generando contenido para landing page…",
    });

    let landingContent: LandingContent | null = null;
    try {
      const sample = sampleManuscript(manuscriptText);
      landingContent = await kdpLandingContentGenerator.generate({
        bookTitle: title,
        author,
        genre,
        themes: analysis.themes,
        description: primary?.metadata.description || "",
        manuscriptSample: sample.text.slice(0, 3000),
        language: (primaryMarket || markets[0]).locale,
      });
    } catch (err: any) {
      console.error("[KdpPipeline] Landing content falló:", err);
    }

    // 6) Guardado final — solo promover columnas legacy si hay mercado primario válido.
    const baseUpdate: any = {
      manuscriptAnalysis: analysis as any,
      marketEntries: marketEntries as any,
      marketingKit: marketingKit as any,
      landingContent: landingContent as any,
      seriesName: seriesName || null,
      seriesNumber: seriesNumber || null,
      seriesDescription: seriesDescription || null,
      aiDisclosure: "ai-assisted",
      status: "draft",
    };

    if (primary) {
      baseUpdate.subtitle = primary.metadata.subtitle;
      baseUpdate.description = primary.metadata.description;
      baseUpdate.keywords = primary.optimizedKeywords;
      baseUpdate.bisacCategories = primary.metadata.categories.slice(0, 2);
      baseUpdate.language = (primaryMarket || markets[0]).langCode;
      baseUpdate.targetMarketplace = (primaryMarket || markets[0]).domain;
    }

    const finalStep = promotionFailed ? "failed" : (partialFailure ? "partial" : "completed");
    const finalMessage = promotionFailed
      ? `Todos los mercados fallaron (${marketEntries.length}/${marketEntries.length})`
      : (partialFailure
          ? `Pipeline parcial: ${successful.length}/${marketEntries.length} mercados OK`
          : "Pipeline completado");

    baseUpdate.pipelineStatus = finalStep;
    baseUpdate.pipelineProgress = {
      step: finalStep,
      marketsTotal: markets.length,
      marketsDone: successful.length,
      message: finalMessage,
      ...(promotionFailed ? { error: "Ningún mercado generado correctamente; no se promueven columnas legacy." } : {}),
    } as any;

    await storage.updateKdpMetadata(kdpMetadataId, baseUpdate);
    console.log(`[KdpPipeline] kdpMetadataId=${kdpMetadataId} ${finalStep} (${successful.length}/${markets.length} mercados OK)`);
  } catch (err: any) {
    console.error(`[KdpPipeline] kdpMetadataId=${params.kdpMetadataId} falló:`, err);
    await storage.updateKdpMetadata(params.kdpMetadataId, {
      pipelineStatus: "failed",
      pipelineProgress: {
        step: "failed",
        marketsTotal: params.selectedMarketIds.length,
        marketsDone: 0,
        error: err?.message || String(err),
      } as any,
    } as any);
  }
}

export function listAvailableMarkets() {
  return KDP_MARKETS.map(m => ({ id: m.id, name: m.name, locale: m.locale, currency: m.currency, domain: m.domain }));
}

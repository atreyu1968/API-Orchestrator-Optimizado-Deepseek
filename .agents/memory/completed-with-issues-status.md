---
name: Estado dual de finalizacion completed / completed_with_issues
description: Regla dura del usuario y patron de gates al añadir un segundo estado terminal de proyecto
---

**Regla:** una novela nunca queda en "completed" limpio con issues conocidos sin resolver; el estado terminal se recalcula centralmente (servicio de completion-status) a partir de las fuentes de pendientes (Revisor Final, instrucciones editoriales, fact-check persistido) y se promociona solo al resolver el ultimo issue.

**Why:** preferencia explicita del usuario guardada en replit.md; los gates best-effort dejan pasar la generacion pero el estado final debe reflejar pendientes.

**How to apply:** todo check project-level de "terminado" debe usar el helper compartido (isProjectCompletedStatus) y aceptar AMBOS estados: gating de features (export, traduccion, audiolibro, KDP), selectores de fuentes ("sources/available", /api/projects/completed), gates de volumenes previos de serie y UI. Los checks de status de capitulo/reedit/translation/audiobook tienen semantica propia y NO se tocan. Al añadir una nueva fuente de issues pendientes, registrarla en collectKnownPendingIssues y llamar recompute al resolverla. Ojo: "completed_with_errors" es de proofreading, no confundir.

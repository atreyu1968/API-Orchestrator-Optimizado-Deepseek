---
name: Canon de nombres de serie (guia vs texto)
description: Como tratar la divergencia de nombres propios entre la guia/hitos de serie y el manuscrito.
---

# Canon de nombres: guia/hitos vs manuscrito

- **Regla en generacion**: los nombres propios de los hitos/hilos de serie son canon literal para el Arquitecto (regla de prompt condicionada a series). El fallo real: la guia decia unos nombres y los 3 volumenes usaron otros, y el gate del volumen 2 lo marco "irreparable" automaticamente.
  **Why:** guia y manuscrito se escribian en paralelo sin conciliarse; el verificador automatico no puede decidir cual version es la canonica.
- **En novelas YA escritas, la divergencia puede ser retcon legitimo**: antes de "corregir" un nombre divergente hay que leer el contexto — en la trilogia real, "Leonor de la Cerda" resulto ser un ALIAS deliberado de la protagonista en el vol. 2 (identidad falsa en una infiltracion). Solo era error una unica mencion suelta en el vol. 1.
  **How to apply:** auditar por SQL (conteo de menciones por volumen + contexto de cada mencion) y corregir solo las apariciones inequivocamente erroneas, de forma quirurgica.

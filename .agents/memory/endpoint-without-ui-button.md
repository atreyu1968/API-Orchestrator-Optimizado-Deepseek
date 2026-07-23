---
name: Endpoint sin boton en la UI
description: Todo consejo al usuario debe tener un disparador visible; endpoints huerfanos dejan vias muertas
---
Regla: cuando un aviso, log o mensaje de la app recomienda una accion al usuario, comprobar que la UI tiene un control que la ejecute. Un endpoint de rescate creado "por si acaso" sin boton es una via muerta: el usuario no usa curl.

**Why:** el relanzamiento manual del pulido de lectores existio como endpoint durante muchas versiones sin boton; el usuario quedo atrapado con lectores bajo meta y solo un boton que no movia esas notas.

**How to apply:** al anadir un endpoint manual de rescate, anadir el boton en la misma sesion (con manejo del 409 de concurrencia). Al escribir mensajes que recomienden acciones, grep en client/ para confirmar que el disparador existe.

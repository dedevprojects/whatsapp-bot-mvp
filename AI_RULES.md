# Reglas Estrictas del Proyecto Plusbot (AI RULES)

## 🛑 REGLA DE ORO: ESTABILIDAD ANTE TODO
Los siguientes archivos y lógicas han alcanzado su **versión de oro (estable) el 27/03** y probaron ser 100% funcionales en producción bajo condiciones de estrés. **NO DEBEN SER MODIFICADOS** bajo ninguna circunstancia a menos que el Usuario lo exija explícita y de forma muy específica:

1. **`services/whatsappService.js`**:
   - **El bucle de Mensajes (`messages.upsert`)**: Contiene la lógica exacta para ignorar respuestas de la propia API de Baileys (`messageId.startsWith('BAE5')` o `...('3EB0')`). Modificar esto causará que el bot entre en un bucle infinito o que se silencie a sí mismo (Human Intervention Bug). **NO TOCAR.**
   - **El candado de Conexión (`connections.has()`)**: Evita sesiones dobles por culpa del auto-reinicio de Nodemon/Render. **NO TOCAR.**

2. **`bot/messageHandler.js`**:
   - **Lógica de Despiece de Saludos (`isGreeting`)**: La longitud de la base de datos de historia y la detección de primer contacto funcionan a la perfección de forma condicional.
   - **Lógica de "Human Intervention"**: Se dispara únicamente si un Humano escribe desde el celular ligado o la Web. Si tocas la variable `fromMe` en *whatsappService*, romperás esto irremediablemente.

3. **`services/gemini.js`**:
   - **Versión de Modelo Requerida**: DEBE usarse EXCLUSIVAMENTE `gemini-2.5-flash`. Cambiar a versiones antiguas (ej. `gemini-1.5-flash-latest` o `pro`) tirará un `Error 404 de API v1beta` por restricciones en la cuenta de facturación.
   - **El Prompt (`systemInstruction`)**: Contiene la estructura avanzada con inyección de Supabase (`knowledge_base`, `website`, etc) pero incluye expresamente la capacidad de que la IA use su raciocinio común (Ej: "no puedes comprar una propiedad con 15 dólares"). **No volver a prompt tonto, ni a prompt estricto que prohíba alucinar completamente sin usar lógica.**

## 🔍 PAUTAS PARA PRÓXIMAS FUNCIONES
Si se requiere añadir nuevas funciones (ej. Dashboards visuales, reportes, botones web, PDFs extra):
1. Añádelos **SOBRE** las rutas existentes en `server.js` o como componentes nuevos.
2. NUNCA sacrifiques ni toques el núcleo de Baileys (`whatsappService.js`, `botEngine.js`, `messageHandler.js`) para intentar hacer que un nuevo feature funcione. Si el feature choca con el Core, descarta el feature.

> *"Funciona maravillosamente. Por favor, mantenlo de esta manera." - Diego, 27 de Marzo 2026.*

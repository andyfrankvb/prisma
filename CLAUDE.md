# Directrices de Desarrollo - PRISMA Core System

## 1. Misión y Arquitectura del Proyecto
PRISMA es el nuevo sistema core desarrollado con Arquitectura Limpia, separación de responsabilidades y tipado estricto TypeScript.
Este proyecto reemplaza incrementalmente al sistema legacy SID.

### Reglas de Arquitectura:
- **Separación de Capas:** La lógica de negocio, las interfaces/DTOs y los servicios de consumo de API deben estar totalmente desacoplados de los componentes de UI.
- **Inyección de Dependencias:** Todos los servicios y clientes HTTP deben inyectarse siguiendo la arquitectura limpia del proyecto.
- **Strict Typing:** Prohibido el uso de `any` o `unknown` no tipados. Define interfaces o tipos explicitos para todas las solicitudes, respuestas y estados.
- **Manejo de Errores:** Utiliza el estándar unificado del proyecto para la captura y presentación de errores HTTP o de validación.

---

## 2. Estándares de Frontend y UI
- **Styling:** Utiliza **Tailwind CSS** exclusivo para estilos.
- **Prohibiciones Legacy:** No importar ni utilizar Bootstrap 5, jQuery, DataTables, SweetAlert, NobleUI ni Feather Icons.
- **Componentización:** Reconstruye vistas utilizando componentes modulares y limpios con composición adecuada.
- **Reusabilidad:** Reutiliza los componentes UI base existentes en `@src/components` antes de crear nuevos.

---

## 3. Control de Versiones (Git), Despliegues Limpios y Cero Breaking Changes
- **Sincronización con Git:** Antes de modificar un archivo existente, asegúrate de mantener la versión actual del HEAD de Git. No elimines código o configuraciones existentes a menos que se indique explícitamente.
- **Despliegue Seguro a Producción:** Todas las modificaciones deben realizarse de forma incremental. Al crear nuevos servicios o componentes, hazlo de forma aditiva respetando las interfaces publicas para no romper el código de otros desarrolladores al subir a producción.
- **Verificación de Conflictos:** Si la tarea requiere cambiar una interfaz o contrato compartido, verifica todos sus usos en el proyecto antes de modificarla.

---

## 4. Estrategia de Migración SID -> PRISMA (Strangler Fig Pattern)
Al recibir tareas de migración desde el repositorio SID:
1. **Paso 1 (Extracción):** Lee el archivo fuente de SID e identifica únicamente:
   - DTOs, modelos e interfaces de TypeScript.
   - Endpoints de API, métodos HTTP, parámetros y payloads.
   - Reglas de negocio y transformaciones de datos.
2. **Paso 2 (Limpieza):** Desecha todo el código acoplado a bibliotecas visuales de SID (NobleUI, Bootstrap, jQuery).
3. **Paso 3 (Generación):** Crea los servicios, contratos y componentes en PRISMA siguiendo los estándares descritos arriba.

---

## 5. Comandos Frecuentes
- **Build / Check de Tipos:** `npm run build` / `npx tsc --noEmit`
- **Linter / Formato:** `npm run lint`
- **Testing:** `npm run test`

---

## 6. Instrucciones de Comportamiento para Claude Code
- Mantén el código conciso, bien estructurado y totalmente documentado mediante tipos explicativos.
- Cuando crees o modifiques archivos, ejecuta el chequeo de tipos (`npx tsc --noEmit`) para garantizar cero errores de compilación antes de dar por terminada la tarea.
- Respeta estrictamente los cambios existentes en Git y no sobrescriba lógica activa sin realizar un refactor seguro.
# Cómo correr la evaluación con tu agente de IA

Lee esto una vez, tarda dos minutos. La idea es que los tres corramos la misma
evaluación con agentes distintos, **sin ponernos de acuerdo antes**, y después comparemos.
Si nos coordinamos antes, las tres respuestas se parecen y el ejercicio no sirve de nada.

## 1. Antes de empezar

**Ten el repositorio actualizado**, con la carpeta `docs/arquitectura/` incluida:

```
git pull origin main
ls docs/arquitectura/
```

Tienes que ver cuatro archivos. Si no están, avísame: significa que todavía no subí el
commit y sin ellos el ejercicio no funciona.

## 2. Abre tu agente DENTRO de la carpeta del proyecto

Esto es lo más importante de todo. **No sirve pegar el prompt en un chat web suelto.**
El agente tiene que poder leer el código, porque el prompt le exige citar `archivo:línea`
en cada afirmación. Un agente sin acceso al repositorio va a inventar, y vamos a perder
el tiempo discutiendo cosas que no son.

Sirve cualquiera que corra en tu máquina sobre la carpeta del proyecto: Claude Code,
Cursor, Copilot en modo agente, Codex, Gemini CLI, el que uses.

## 3. Llena los números antes de correrlo

Abre `docs/arquitectura/PROMPT-EVALUACION-ARQUITECTURA.md` y busca los `[POR LLENAR]` de
la sección 5. Son ocho. Llena los que sepas y **deja marcados los que no**, no los
inventes: el prompt le pide al agente que responda con escenarios cuando falte un dato.

Los tres que más pesan:
- usuarios **concurrentes en hora pico** (no el total de usuarios)
- documentos con OCR por día
- si va a haber app móvil o consumo por terceros, y cuándo

Si entre los tres llenamos los mismos números, mejor: las respuestas quedan comparables.

## 4. Córrelo

Pégale a tu agente **todo el contenido del archivo a partir de la línea `## El prompt`**,
hacia abajo. Lo de arriba de esa línea son instrucciones para nosotros, no para él.

El agente va a empezar leyendo `docs/arquitectura/DEUDA-TECNICA.md`, que es el inventario
de lo que ya está verificado. Su trabajo no es repetirlo: es **confirmarlo, corregirlo y
completarlo**. Si encuentra que algo de ahí está mal, eso cuenta como hallazgo.

## 5. Qué me regresas

La respuesta completa con las secciones 7.1 a 7.7 tal como las pide el prompt. Guárdala
en un archivo con tu nombre, por ejemplo `evaluacion-tu-nombre.md`, y dime con qué agente
y qué modelo la sacaste.

No edites la respuesta del agente para que se vea mejor. Si dijo algo que no cuadra, esa
es justamente la información útil.

## 6. Qué vamos a comparar

Cuando estén las tres:

1. **Las discrepancias de hecho primero.** Si dos agentes describen distinto el mismo
   archivo, uno se equivocó. Eso se resuelve abriendo el código, no votando.
2. **Lo que aparece en las tres** con la misma evidencia, es real. Lo que aparece en una
   sola, hay que ir a verificarlo antes de creerle.
3. **La tabla de alternativas (7.4) completa**, no la conclusión. Lo interesante no es qué
   eligió cada agente, sino contra qué lo comparó.
4. **El reparto que propone cada uno (7.5)**, para ver si coinciden con el que tenemos.
5. **Lo que NO haría (7.7)**, que es donde se nota quién entendió las restricciones. Si
   alguno propone nube pública, CDN o Kubernetes, no leyó la sección 6 del prompt.

## 7. Dos advertencias

- **El agente va a querer arreglar cosas.** No lo dejes: en esta ronda el entregable es el
  diagnóstico. Si empieza a editar archivos, páralo.
- **No lo apuntes a producción.** Ni a la base ni al servidor. Es una lectura del código.

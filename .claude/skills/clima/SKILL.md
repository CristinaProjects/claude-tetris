---
name: clima
description: Consulta el tiempo actual y la previsión de los próximos días para la ubicación local (detectada por IP) o para una ciudad concreta. Usar cuando el usuario pregunte por el clima, el tiempo, la temperatura, si va a llover, o invoque /clima.
argument-hint: "[ciudad opcional]"
allowed-tools: Bash(curl:*)
---

# Clima

Obtén la información meteorológica con `curl` contra **wttr.in** (gratuito, sin API key).

## Ubicación

- Si se pasa argumento (`$ARGUMENTS`), úsalo como ciudad. Sustituye los espacios por `+` (ej. `San+Sebastian`).
- Si no hay argumento, deja la ubicación vacía: wttr.in detecta la ubicación local por la IP.

## Pasos

1. Pide los datos en JSON y en español:

   ```bash
   curl -s --max-time 15 "https://wttr.in/<CIUDAD>?format=j1&lang=es"
   ```

   (Sin ciudad: `https://wttr.in/?format=j1&lang=es`)

2. Del JSON extrae:
   - `nearest_area[0]`: `areaName`, `region`, `country` → ubicación detectada.
   - `current_condition[0]`: `temp_C`, `FeelsLikeC`, `humidity`, `windspeedKmph`, `winddir16Point`, `precipMM`, `lang_es[0].value` (descripción).
   - `weather[0..2]`: `date`, `mintempC`, `maxtempC`, y la probabilidad de lluvia máxima de `hourly[].chanceofrain`.

3. Responde en español, breve, con este formato:

   ```
   📍 <Ciudad>, <Región> (<País>)
   Ahora: <descripción>, <temp> °C (sensación <feels> °C)
   Humedad <h> % · Viento <v> km/h <dir> · Precipitación <p> mm

   Previsión:
   - <fecha>: <min>–<max> °C, lluvia <prob> %
   - ...
   ```

## Errores

- Si `curl` falla, tarda demasiado o la respuesta no es JSON válido (p. ej. "Unknown location"), dilo claramente y sugiere indicar otra ciudad. **No inventes datos.**
- Si la ubicación detectada por IP no parece la del usuario (VPN, proxy corporativo), avísalo y sugiere pasar la ciudad: `/clima Madrid`.

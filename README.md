# Algotrading Multi-Agente 24/7 (Cloud Architecture)

Este repositorio contiene la estructura base para un sistema institucional de Trading Multi-Agente capaz de ejecutarse 24/7 en la nube (Railway/Render + Firebase), eliminando la dependencia de un PC local.

## Tecnologías Principales
- **Backend (Motor 24/7):** Node.js (TypeScript), `ws` para WebSockets, Express, ccxt (Binance/MEXC), sdk Alpaca/Hyperliquid.
- **Frontend (Dashboard):** React (Vite) + Tailwind CSS + TradingView `lightweight-charts`.
- **Base de Datos & Auth:** Firebase Firestore (Registro de operaciones y simulaciones) y Firebase Auth.
- **IA/Orquestación:** Integración planificada con Groq / Gemini via OpenRouter para Análisis y Parsing de Lenguaje Natural.

## Estructura del Proyecto

```
c:\Users\yo\Pictures\Descargaspc\0a\algotradingNEW/
├── backend/                  # Motor 24/7 de Trading (Node.js)
│   ├── src/
│   │   ├── agents/           # Lógica de Inteligencia Artificial (CEO, Analista, RiskManager)
│   │   │   └── TradingAgent.ts
│   │   ├── utils/            # Conexiones con exchanges y utilidades
│   │   └── firebase/         # Firebase Admin SDK y manejo de base de datos
│   ├── server.ts             # Punto de entrada WebSockets & Express
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # Dashboard Web (React + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   └── TradingChart.tsx   # Gráfico en Tiempo Real (TradingView)
│   │   ├── contexts/         # AuthProvider de Firebase
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── tsconfig.json
├── firestore.rules           # Reglas de seguridad Firebase
└── README.md
```

## Guía de Despliegue en la Nube

### 1. Despliegue del Backend en Railway
Railway es ideal para contenedores Docker o aplicaciones Node.js 24/7 sin sleep.
1. Haz push de este repositorio a tu GitHub.
2. Inicia sesión en **Railway.app** y crea un `New Project > Deploy from GitHub repo`.
3. Selecciona la carpeta `/backend` como tu *Root Directory* de despliegue si así lo configuras, o ten el `server.ts` configurado en el `start` script de npm.
4. **Variables de Entorno necesarias en Railway:**
   - `PORT=8080` (O el que defina Railway automáticamente).
   - `MEXC_API_KEY`, `MEXC_API_SECRET`
   - `FIREBASE_SERVICE_ACCOUNT_KEY` (En formato JSON stringificado, para que `firebase-admin` lo lea).
   - `MODE="PAPER"` (O `"LIVE"`, controla la ejecución de los agentes).

### 2. Despliegue del Frontend en Firebase Hosting
Firebase Hosting es perfecto y económico para React SPA estáticas.
1. En la carpeta `frontend/`, instala el CLI de Firebase si no lo tienes: `npm install -g firebase-tools`.
2. Ház login en terminal: `firebase login`.
3. Inicializa el proyecto: `firebase init hosting`.
   - Selecciona tu proyecto creado en la Consola de Firebase.
   - Introduce el directorio público: `dist`.
   - Marca "Yes" para configurarlo como Single-Page App (SPA).
4. Crea la build de Vite: `npm run build`.
5. Ejecuta el despliegue: `firebase deploy --only hosting`.

¡Listo! Todo tu stack de Paper Trading y Live Trading estará corriendo de forma autónoma con datos en tiempo real.

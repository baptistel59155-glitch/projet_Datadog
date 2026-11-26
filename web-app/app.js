// 1. Initialisation de l'APM Datadog (OBLIGATOIREMENT EN PREMIER)
const tracer = require('dd-trace').init({
  logInjection: true, // Injecte automatiquement les IDs de trace dans les logs
  plugins: true // S'assure que tous les plugins d'intégration automatique (dont fetch/http) sont actifs
});

const express = require('express');
const StatsD = require('hot-shots');
const winston = require('winston'); // <-- Importation de Winston important pour correler traces & logs

// 2.1 Configuration du client DogStatsD pour les métriques
const dogstatsd = new StatsD({
  host: process.env.DD_AGENT_HOST || 'localhost',
  port: 8125
});

// 2.2 Configuration du Logger Winston 
const logger = winston.createLogger({
  level: 'info', 
  format: winston.format.combine( 
    winston.format.timestamp(), 
    winston.format.errors({ stack: true }), // Indispensable pour capturer la stack trace
    winston.format.json() // Format final pour Datadog 
  ), 
  transports: [ 
    new winston.transports.Console() 
  ]
});  

const app = express();
const PORT = process.env.PORT || 3000;

// 3. Middleware global : utilise Winston à la place de console.log
app.use((req, res, next) => { 
  res.on('finish', () => { 
    const statusType = res.statusCode >= 400 ? 'warn' : 'info'; 

    logger.log(statusType, `Requête ${req.method} ${req.originalUrl}`, { 
      http_status: res.statusCode, 
      http: { status_code: res.statusCode }, 
      route: req.path,
      timestamp: new Date().toISOString(),
      ...res.locals 
    }); 
  }); 
  next(); 
});

// Liste des 3 conteneurs backend 
const backends = [
  'http://my-back-container-1:3000',
  'http://my-back-container-2:3000',
  'http://my-back-container-3:3000'
];

// Route principale '/'
app.get('/', (req, res) => {
  dogstatsd.increment('page.views', 1, ['env:production', 'route:home']);

  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Mon Application Web Observabilisée</title>
        <!-- SDK Client Datadog RUM -->
        <script src="https://www.datadoghq-browser-agent.com/eu1/v5/datadog-rum.js"></script>
        <script>
          window.DD_RUM && window.DD_RUM.init({
            applicationId: '19f15b29-129c-4e30-abf1-2b142e8ef550',
            clientToken: 'pubdfaf7780b9c87c02322d847929c10554',
            site: 'datadoghq.eu',
            service: 'my-node-app',
            env: 'production',
            version: '1.0.0',
            sessionSampleRate: 100,
            sessionReplaySampleRate: 20,
            trackResources: true,
            trackUserInteractions: true,
            trackLongTasks: true,
          });
        </script>
      </head>
      <body>
        <h1>Hello World !</h1>
        <p>L'application Node.js est pleinement connectée à Datadog.</p>
      </body>
    </html>
  `);
});

app.get('/appel_back', async (req, res) => {
  let targetBackend = '';
  
  try {
    const randomIndex = Math.floor(Math.random() * backends.length);
    targetBackend = backends[randomIndex];

    logger.info(`[Front] Appel envoyé vers : ${targetBackend}`, { targetBackend }); 
    
    const response = await fetch(`${targetBackend}/back_appel`);
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP : ${response.status}`);
    }

    const data = await response.text();
    res.send(`Appel du serveur ${targetBackend} - ${data}`);

  } catch (error) {
    logger.error(`[Front] Erreur lors de l'appel vers ${targetBackend} : ${error.message}`, { 
      error: { 
        message: error.message, 
        kind: error.name, 
        stack: error.stack 
      }, 
      target_backend: targetBackend 
    });

    res.status(500).send(`Erreur lors de l'appel au back : ${targetBackend} - ${error.message}`); 
  }
});


app.get('/temperature', async (req, res, next) => {
  const serviceName = process.env.DD_SERVICE || 'my-node-app-1';
  const match = serviceName.match(/\d+$/);
  const containerId = match ? parseInt(match[0], 10) : 1;

  const startHouse = (containerId - 1) * 10 + 1;
  const endHouse = containerId * 10;

  const summary = [];

  for (let i = startHouse; i <= endHouse; i++) {
    const temperature = parseFloat((Math.random() * (25 - 15) + 15).toFixed(2));
    
    // Format demandé : Numéro de maison - Numéro du conteneur (ex: 11-2)
    const nomMaison = `${i}-${containerId}`;

    // IMPORTANT : On l'ajoute dans l'objet Winston pour qu'il devienne une facette Datadog
    logger.info(`Température mesurée pour Maison ${nomMaison} : ${temperature} °C`, { 
      temperature, 
      Maison: nomMaison,
      container: serviceName
    });

    const tags = ['env:production', `Maison:${nomMaison}`, `container:${serviceName}`];
    dogstatsd.gauge('app.temperature', temperature, tags, (error) => {
      if (error) {
        console.error(`Erreur DogStatsD pour Maison ${nomMaison} :`, error);
      }
    });

    summary.push(`Maison ${nomMaison} : ${temperature} °C`);
  }

  res.send(`[${serviceName}] Tranche mesurée avec succès :\n\n` + summary.join('\n'));
});
  

// Gestionnaire 404
app.use((req, res, next) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Erreur 404 - Page non trouvée</title>
      </head>
      <body>
        <h1>404 - Introuvable</h1>
        <p>La ressource <code>${req.originalUrl}</code> demandée n'existe pas.</p>
      </body>
    </html>
  `);
});

// Démarrage du serveur
app.listen(PORT, () => { 
  logger.info(`Serveur démarré avec succès sur le port ${PORT}`, {
    port: PORT,
    service: process.env.DD_SERVICE 
  }); 
});

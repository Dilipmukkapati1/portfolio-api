/** Swagger UI page — loads spec from same host for Try-it-out. */
export function buildSwaggerHtml(openApiUrl: string): string {
  const escapedUrl = openApiUrl.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Portfolio API — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.3/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.3/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.3/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: '${escapedUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
        persistAuthorization: true,
        tryItOutEnabled: true,
        displayRequestDuration: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 2,
        validatorUrl: null,
        onComplete: function () {
          var stored = localStorage.getItem('portfolio-swagger-household-id');
          if (stored && window.ui && window.ui.preauthorizeApiKey) {
            window.ui.preauthorizeApiKey('HouseholdId', stored);
          }
        },
        requestInterceptor: function (req) {
          var auth = req.headers && req.headers['x-household-id'];
          if (auth) {
            localStorage.setItem('portfolio-swagger-household-id', auth);
          }
          return req;
        }
      });
    };
  </script>
</body>
</html>`;
}

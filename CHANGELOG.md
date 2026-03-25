# Changelog

## 0.0.9

### Breaking

- **Core/MCP:** La ejecución de herramientas Composio deja de basarse solo en `mcpUrl` y la cabecera `x-consumer-api-key` con `consumerKey`. En `index.ts`, la conexión MCP (`StreamableHTTPClientTransport`) usa la URL y las cabeceras de la sesión creada con `new Composio({ apiKey }).create(userId)` de `@composio/core`. Sin `composioApiKey` y `userId` (o sin las variables de entorno `COMPOSIO_API_KEY` y `COMPOSIO_USER_ID`, leídas en `parseComposioConfig` de `src/config.ts`) no se inicializa `mcpClient` y las llamadas a herramientas fallan aunque `consumerKey` siga siendo obligatorio para el listado síncrono `fetchToolsSync` y el registro de nombres de herramientas.

### Fixes

- **Build/CI:** El workflow `.github/workflows/publish.yml` publica ante pushes a la rama `main` en lugar de `master`, alineando el despliegue con la rama efectiva del repositorio y evitando que los cambios de versión en `package.json` no disparen el job.

### Changes

- **Entry/CLI:** Se registra el subcomando `composio remove-toolkit <toolkit>` vía `api.registerCli` en `index.ts`, que lista cuentas conectadas con `composio.connectedAccounts.list`, empareja por `toolkit.slug` y elimina con `connectedAccounts.delete` usando el `userId` del plugin.
- **Packaging/manifest:** `openclaw.plugin.json` amplía el esquema y las `uiHints` con `composioApiKey` (clave sensible) y `userId`; `composioPluginConfigSchema` en `src/config.ts` replica las mismas pistas y `src/types.ts` extiende `ComposioConfig` con ambos campos.
- **Packaging/Dependencies:** `package.json` añade la dependencia `@composio/core` (^0.6.7) para la sesión MCP y las operaciones del CLI sobre cuentas conectadas.
- **Entry/Tools:** El texto devuelto cuando `mcpClient` no está disponible tras `mcpReady` en `execute` indica configurar `composioApiKey` y `userId` (o variables de entorno), verificar `consumerKey` y reiniciar el gateway, sustituyendo el mensaje que solo citaba la clave de consumidor.
- **Docs/README:** Se vacía el contenido de `README.md` respecto a versiones anteriores, de modo que ya no se distribuyen en el paquete las instrucciones de instalación, `openclaw config` y la tabla de opciones que figuraban antes del cambio.

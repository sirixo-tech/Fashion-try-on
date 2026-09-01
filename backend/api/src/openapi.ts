import { type INestApplication } from "@nestjs/common";
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from "@nestjs/swagger";

import { DeveloperApiModule } from "./developer-api/developer-api.module.js";

const PUBLIC_API_PATH_PREFIX = "/api/v1/public";
const PUBLIC_API_SECURITY_SCHEME = "SelfXApiKey";

export function setupOpenApiDocs(app: INestApplication): {
  internal: OpenAPIObject;
  publicApi: OpenAPIObject;
} {
  const internal = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("SelfX API")
      .setDescription("SelfX Virtual Try-On API")
      .setVersion("1.0")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("api/docs", app, internal);

  const publicApi = buildPublicApiOpenApiDocument(app);
  SwaggerModule.setup("api/v1/public/docs", app, publicApi, {
    customSiteTitle: "SelfX Public API Docs",
    jsonDocumentUrl: "api/v1/public/openapi.json",
  });

  return { internal, publicApi };
}

function buildPublicApiOpenApiDocument(app: INestApplication): OpenAPIObject {
  const fullPublicModuleDocument = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("SelfX Public API")
      .setDescription(
        "External developer-facing SelfX Virtual Try-On API. Authenticate with a scoped SelfX API key. SelfX executes AI providers server-side; external clients must never use provider credentials directly.",
      )
      .setVersion("1.0")
      .addApiKey(
        {
          type: "apiKey",
          in: "header",
          name: "x-selfx-api-key",
          description:
            "Preferred Public API credential header. Authorization: Bearer and x-api-key are also accepted by SelfX.",
        },
        PUBLIC_API_SECURITY_SCHEME,
      )
      .addServer("https://api.selfx.example", "Production")
      .addServer("https://sandbox-api.selfx.example", "Sandbox")
      .build(),
    {
      include: [DeveloperApiModule],
      operationIdFactory: (_controllerKey, methodKey) => methodKey,
    },
  );

  return filterOpenApiDocument(fullPublicModuleDocument, PUBLIC_API_PATH_PREFIX);
}

function filterOpenApiDocument(
  document: OpenAPIObject,
  pathPrefix: string,
): OpenAPIObject {
  const paths = Object.fromEntries(
    Object.entries(document.paths).filter(([path]) =>
      path.startsWith(pathPrefix),
    ),
  ) as OpenAPIObject["paths"];

  const filtered: OpenAPIObject = {
    ...document,
    info: {
      ...document.info,
      title: "SelfX Public API",
    },
    tags: document.tags?.filter((tag) => tag.name === "Public API"),
    paths,
    components: {
      ...document.components,
      securitySchemes: {
        [PUBLIC_API_SECURITY_SCHEME]:
          document.components?.securitySchemes?.[PUBLIC_API_SECURITY_SCHEME] ??
          {
            type: "apiKey",
            in: "header",
            name: "x-selfx-api-key",
          },
      },
      schemas: pruneSchemas(document.components?.schemas ?? {}, paths),
    },
    security: [{ [PUBLIC_API_SECURITY_SCHEME]: [] }],
  };

  return filtered;
}

function pruneSchemas(
  schemas: NonNullable<NonNullable<OpenAPIObject["components"]>["schemas"]>,
  paths: OpenAPIObject["paths"],
): NonNullable<NonNullable<OpenAPIObject["components"]>["schemas"]> {
  const reachable = new Set<string>();
  collectSchemaRefs(paths, reachable);

  for (const schemaName of Array.from(reachable)) {
    const schema = schemas[schemaName];
    if (schema) {
      collectSchemaRefs(schema, reachable);
    }
  }

  return Object.fromEntries(
    Object.entries(schemas).filter(([schemaName]) => reachable.has(schemaName)),
  );
}

function collectSchemaRefs(value: unknown, refs: Set<string>): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSchemaRefs(item, refs);
    }
    return;
  }

  const objectValue = value as Record<string, unknown>;
  const ref = objectValue.$ref;
  if (typeof ref === "string") {
    const schemaName = schemaNameFromRef(ref);
    if (schemaName) {
      refs.add(schemaName);
    }
  }

  for (const child of Object.values(objectValue)) {
    collectSchemaRefs(child, refs);
  }
}

function schemaNameFromRef(ref: string): string | null {
  const prefix = "#/components/schemas/";
  if (!ref.startsWith(prefix)) {
    return null;
  }

  return decodeURIComponent(ref.slice(prefix.length));
}

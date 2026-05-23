/** Minimal OpenAPI 3 types (avoids pulling openapi-types). */
export namespace OpenAPIV3 {
  export interface Document {
    openapi: string;
    info: InfoObject;
    servers?: ServerObject[];
    paths: PathsObject;
    components?: ComponentsObject;
    tags?: TagObject[];
    security?: SecurityRequirementObject[];
  }

  export interface InfoObject {
    title: string;
    version: string;
    description?: string;
    contact?: { name?: string; url?: string; email?: string };
  }

  export interface ServerObject {
    url: string;
    description?: string;
  }

  export type PathsObject = Record<string, PathItemObject>;

  export interface PathItemObject {
    get?: OperationObject;
    post?: OperationObject;
    put?: OperationObject;
    delete?: OperationObject;
  }

  export interface OperationObject {
    tags?: string[];
    summary?: string;
    operationId?: string;
    parameters?: ParameterObject[];
    requestBody?: RequestBodyObject;
    responses: ResponsesObject;
    security?: SecurityRequirementObject[];
  }

  export interface ParameterObject {
    name: string;
    in: "query" | "header" | "path" | "cookie";
    description?: string;
    required?: boolean;
    schema?: SchemaObject;
  }

  export interface RequestBodyObject {
    required?: boolean;
    content: Record<string, MediaTypeObject>;
  }

  export interface MediaTypeObject {
    schema?: SchemaObject;
  }

  export type ResponsesObject = Record<
    string,
    ResponseObject | { $ref: string }
  >;

  export interface ResponseObject {
    description: string;
    content?: Record<string, MediaTypeObject>;
  }

  export interface ComponentsObject {
    schemas?: Record<string, SchemaObject>;
    responses?: Record<string, ResponseObject | { $ref: string }>;
    securitySchemes?: Record<string, SecuritySchemeObject>;
  }

  export interface SecuritySchemeObject {
    type: string;
    in?: string;
    name?: string;
    description?: string;
  }

  export type SecurityRequirementObject = Record<string, string[]>;

  export interface TagObject {
    name: string;
    description?: string;
  }

  export interface SchemaObject {
    type?: string;
    format?: string;
    enum?: readonly string[];
    properties?: Record<string, SchemaObject>;
    items?: SchemaObject;
    required?: string[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    default?: unknown;
    example?: unknown;
    description?: string;
    additionalProperties?: boolean | SchemaObject;
    oneOf?: SchemaObject[];
    $ref?: string;
  }
}

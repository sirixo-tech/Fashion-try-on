export interface ApiServerConfig {
  port: number;
}

function readPort(value: string, key: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${key} must be an integer between 1 and 65535`);
  }
  return port;
}

export function loadApiServerConfig(env = process.env): ApiServerConfig {
  if (env.PORT && env.PORT.trim() !== "") {
    return { port: readPort(env.PORT, "PORT") };
  }
  if (env.API_PORT && env.API_PORT.trim() !== "") {
    return { port: readPort(env.API_PORT, "API_PORT") };
  }
  return { port: 3001 };
}

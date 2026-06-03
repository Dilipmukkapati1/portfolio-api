import { FmpInstrumentDataProvider } from "../integrations/fmp/fmpInstrumentDataProvider.js";
import { CompositeInstrumentDataProvider } from "./compositeInstrumentDataProvider.js";
import type { InstrumentDataProvider } from "./instrumentDataProvider.types.js";
import {
  stubInstrumentDataProvider,
  StubInstrumentDataProvider,
} from "./stubInstrumentDataProvider.js";

export type { InstrumentDataProvider } from "./instrumentDataProvider.types.js";
export {
  stubInstrumentDataProvider,
  StubInstrumentDataProvider,
} from "./stubInstrumentDataProvider.js";

let cachedProvider: InstrumentDataProvider | null = null;

export function getInstrumentDataProvider(): InstrumentDataProvider {
  if (cachedProvider) return cachedProvider;

  const kind = (process.env.INSTRUMENT_DATA_PROVIDER ?? "stub").toLowerCase();
  const apiKey = process.env.FMP_API_KEY?.trim();

  if (kind === "fmp" && apiKey) {
    const fmp = new FmpInstrumentDataProvider({
      apiKey,
      baseUrl: process.env.FMP_BASE_URL,
    });
    cachedProvider = new CompositeInstrumentDataProvider(fmp);
    return cachedProvider;
  }

  cachedProvider = stubInstrumentDataProvider;
  return cachedProvider;
}

/** Reset provider singleton (tests). */
export function resetInstrumentDataProvider(): void {
  cachedProvider = null;
}

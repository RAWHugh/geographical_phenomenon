import { annualDaylight } from './annual-daylight';
import type { AnnualDaylightRequest, AnnualDaylightResponse } from './annual-daylight';

self.onmessage = (event: MessageEvent<AnnualDaylightRequest>) => {
  let response: AnnualDaylightResponse;
  try {
    response = { data: annualDaylight(event.data) };
  } catch {
    response = { error: true };
  }
  self.postMessage(response);
};

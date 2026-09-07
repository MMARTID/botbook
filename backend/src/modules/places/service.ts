import { DEFAULT_BUSINESS_SCHEDULE, type BusinessSchedule, type WeekDay } from '../../lib/businessSchedule.js';
import { detectBusinessTypeFromPlaceTypes, type BusinessType } from '../../lib/businessType.js';

const PLACES_API_BASE_URL = 'https://places.googleapis.com/v1';

function getApiKey() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  }
  return apiKey;
}

function padTime(value: number) {
  return value.toString().padStart(2, '0');
}

function formatTime(hour: number, minute: number) {
  return `${padTime(hour)}:${padTime(minute)}`;
}

const GOOGLE_DAY_TO_WEEK_DAY: Record<number, WeekDay> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

type PlacesAutocompletePrediction = {
  placePrediction?: {
    placeId?: string;
    text?: {
      text?: string;
    };
    structuredFormat?: {
      mainText?: {
        text?: string;
      };
      secondaryText?: {
        text?: string;
      };
    };
  };
};

type PlacesAutocompleteResponse = {
  suggestions?: PlacesAutocompletePrediction[];
};

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  address: string;
};

type PlacesRegularOpeningHours = {
  openNow?: boolean;
  periods?: Array<{
    open?: { day?: number; hour?: number; minute?: number };
    close?: { day?: number; hour?: number; minute?: number };
  }>;
  weekdayDescriptions?: string[];
};

type PlacesPlaceDetails = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  regularOpeningHours?: PlacesRegularOpeningHours;
  types?: string[];
};

export type PlaceDetails = {
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  schedule: BusinessSchedule;
  types: string[];
};

export type PlaceSearchLocation = {
  countryCode?: string;
  latitude?: number;
  longitude?: number;
};

// Radio de sesgo cuando buscamos por geolocalización: cubre un área
// metropolitana sin restringir tanto como para perder negocios cercanos
// en la periferia.
const LOCATION_BIAS_RADIUS_METERS = 50_000;

export async function searchPlaces(query: string, location?: PlaceSearchLocation): Promise<PlaceSearchResult[]> {
  const body: Record<string, unknown> = { input: query };
  if (location?.countryCode) {
    body.includedRegionCodes = [location.countryCode.toUpperCase()];
  }
  if (location?.latitude !== undefined && location?.longitude !== undefined) {
    // El sesgo por coordenadas es más preciso que un país entero: prioriza
    // resultados cercanos al usuario en vez de filtrar por región completa.
    body.locationBias = {
      circle: {
        center: { latitude: location.latitude, longitude: location.longitude },
        radius: LOCATION_BIAS_RADIUS_METERS,
      },
    };
  }

  const response = await fetch(`${PLACES_API_BASE_URL}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': getApiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Places autocomplete failed (${response.status}): ${error}`);
  }

  const data = (await response.json()) as PlacesAutocompleteResponse;
  const suggestions = data.suggestions ?? [];

  return suggestions
    .filter((suggestion) => Boolean(suggestion.placePrediction?.placeId))
    .map((suggestion) => {
      const prediction = suggestion.placePrediction!;
      const structured = prediction.structuredFormat;
      const name = structured?.mainText?.text ?? prediction.text?.text ?? 'Negocio';
      const address = structured?.secondaryText?.text ?? '';
      return {
        placeId: prediction.placeId!,
        name,
        address,
      };
    });
}

export type DemoPlaceSearchResult = PlaceSearchResult & {
  businessType: BusinessType;
  photoUrl: string | null;
};

type PlacesTextSearchPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  types?: string[];
  photos?: Array<{ name?: string }>;
};

type PlacesTextSearchResponse = {
  places?: PlacesTextSearchPlace[];
};

// Máximo de resultados enriquecidos con foto en la demo: cada uno añade una
// llamada extra a la API de fotos, así que se limita para acotar coste y
// latencia de una búsqueda pública sin autenticar.
const DEMO_SEARCH_MAX_RESULTS = 5;
const DEMO_PHOTO_MAX_WIDTH_PX = 160;
const PHOTO_NAME_PATTERN = /^places\/[^/]+\/photos\/[^/]+$/;

/**
 * Resuelve el `name` de una foto de Places (`places/<id>/photos/<ref>`) a una
 * URL real de imagen. El endpoint de medios de Google redirige (302) a una
 * URL de `googleusercontent.com` sin clave de API incrustada — se sigue esa
 * redirección aquí, en el servidor, para no exponer `GOOGLE_PLACES_API_KEY`
 * al navegador.
 */
export async function resolvePlacePhotoUrl(photoName: string, maxWidthPx: number): Promise<string | null> {
  if (!PHOTO_NAME_PATTERN.test(photoName)) {
    return null;
  }

  const url = `${PLACES_API_BASE_URL}/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${getApiKey()}`;
  const response = await fetch(url, { redirect: 'manual' });
  return response.headers.get('location');
}

/**
 * Búsqueda de negocios para la demo pública de la landing, enriquecida con
 * foto y tipo de negocio detectado — a diferencia de `searchPlaces` (usada en
 * el alta autenticada), que solo necesita nombre y dirección para el
 * autocompletado. Usa Places Text Search (New), que sí admite `photos` y
 * `types` por resultado; Autocomplete no los devuelve nunca.
 */
export async function searchPlacesForDemo(query: string): Promise<DemoPlaceSearchResult[]> {
  const response = await fetch(`${PLACES_API_BASE_URL}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': getApiKey(),
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.types,places.photos',
    },
    body: JSON.stringify({ textQuery: query, regionCode: 'ES', languageCode: 'es' }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Places text search failed (${response.status}): ${error}`);
  }

  const data = (await response.json()) as PlacesTextSearchResponse;
  const places = (data.places ?? []).slice(0, DEMO_SEARCH_MAX_RESULTS);

  const results = await Promise.all(
    places.map(async (place) => {
      const photoName = place.photos?.[0]?.name;
      const photoUrl = photoName
        ? await resolvePlacePhotoUrl(photoName, DEMO_PHOTO_MAX_WIDTH_PX).catch(() => null)
        : null;

      return {
        placeId: place.id ?? '',
        name: place.displayName?.text ?? 'Negocio',
        address: place.formattedAddress ?? '',
        businessType: detectBusinessTypeFromPlaceTypes(place.types),
        photoUrl,
      };
    }),
  );

  return results.filter((result) => result.placeId.length > 0);
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const encodedPlaceId = encodeURIComponent(placeId);
  const response = await fetch(`${PLACES_API_BASE_URL}/places/${encodedPlaceId}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': getApiKey(),
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,regularOpeningHours,types',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Places details failed (${response.status}): ${error}`);
  }

  const data = (await response.json()) as PlacesPlaceDetails;

  return {
    placeId: data.id ?? placeId,
    name: data.displayName?.text ?? 'Negocio',
    address: data.formattedAddress ?? '',
    phone: data.internationalPhoneNumber ?? data.nationalPhoneNumber ?? null,
    schedule: parsePlacesHoursToBusinessSchedule(data.regularOpeningHours),
    types: data.types ?? [],
  };
}

export function parsePlacesHoursToBusinessSchedule(
  regularOpeningHours?: PlacesRegularOpeningHours,
): BusinessSchedule {
  if (!regularOpeningHours?.periods?.length) {
    return DEFAULT_BUSINESS_SCHEDULE;
  }

  const schedule = JSON.parse(JSON.stringify(DEFAULT_BUSINESS_SCHEDULE)) as BusinessSchedule;

  // Reset all days to closed so we only enable the ones returned by Places.
  for (const day of Object.keys(schedule.week) as WeekDay[]) {
    schedule.week[day] = { enabled: false, intervals: [] };
  }

  for (const period of regularOpeningHours.periods) {
    const openDay = period.open?.day;
    const openHour = period.open?.hour;
    const openMinute = period.open?.minute ?? 0;
    const closeHour = period.close?.hour;
    const closeMinute = period.close?.minute ?? 0;

    if (openDay === undefined || openHour === undefined || closeHour === undefined) {
      continue;
    }

    const weekDay = GOOGLE_DAY_TO_WEEK_DAY[openDay];
    if (!weekDay) continue;

    schedule.week[weekDay].enabled = true;
    schedule.week[weekDay].intervals.push({
      start: formatTime(openHour, openMinute),
      end: formatTime(closeHour, closeMinute),
    });
  }

  // Sort intervals by start time and keep a reasonable max of 3.
  for (const day of Object.keys(schedule.week) as WeekDay[]) {
    const daySchedule = schedule.week[day];
    if (daySchedule.enabled) {
      daySchedule.intervals.sort((left, right) => left.start.localeCompare(right.start));
      if (daySchedule.intervals.length > 3) {
        daySchedule.intervals = daySchedule.intervals.slice(0, 3);
      }
    }
  }

  return schedule;
}

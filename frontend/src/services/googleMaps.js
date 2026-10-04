import { useJsApiLoader } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY } from '../utils/constants';

// Must be a module-level constant: a new array each render makes the loader reload the script.
export const GOOGLE_MAPS_LIBRARIES = ['places'];

const LOADER_OPTIONS = {
  id: 'yieldwrap-google-maps',
  googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  libraries: GOOGLE_MAPS_LIBRARIES,
};

/** Shared loader so MapView and AddressInput load the Maps JS API exactly once. Only call when a key exists. */
export function useGoogleMapsLoader() {
  return useJsApiLoader(LOADER_OPTIONS);
}

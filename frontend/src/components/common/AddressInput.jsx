import { useEffect, useId, useRef, useState } from 'react';
import { Autocomplete } from '@react-google-maps/api';
import toast from 'react-hot-toast';
import Icon from './Icon';
import Spinner from './Spinner';
import useDebounce from '../../hooks/useDebounce';
import { HAS_GOOGLE_MAPS } from '../../utils/constants';
import { hasCoords } from '../../utils/geo';
import { getCurrentPosition, reverseGeocode, searchAddress } from '../../services/geocoding';
import { useGoogleMapsLoader } from '../../services/googleMaps';

/**
 * Address picker yielding {address, lat, lng}.
 * Google Places Autocomplete when VITE_GOOGLE_MAPS_API_KEY is set, otherwise OpenStreetMap Nominatim search.
 * Typing free text clears the coordinates until a suggestion (or "Use my location") is chosen.
 */
export default function AddressInput(props) {
  return HAS_GOOGLE_MAPS ? <GoogleAddressInput {...props} /> : <OsmAddressInput {...props} />;
}

function useLocateMe(onChange) {
  const [locating, setLocating] = useState(false);
  const locate = async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      const loc = await reverseGeocode(pos.lat, pos.lng);
      onChange?.(loc);
      toast.success('Location set from your device');
    } catch (e) {
      toast.error(e?.message || 'Unable to get your location');
    } finally {
      setLocating(false);
    }
  };
  return { locating, locate };
}

function Shell({ id, label, required, hint, error, value, locating, onLocate, children }) {
  const pinned = hasCoords(value);
  return (
    <div>
      {label ? (
        <label htmlFor={id} className="label">
          {label}
          {required ? <span className="text-critical"> *</span> : null}
        </label>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">{children}</div>
        <button type="button" className="btn btn-secondary shrink-0" onClick={onLocate} disabled={locating}>
          {locating ? <Spinner size={16} /> : <Icon name="crosshair" size={16} />}
          Use my location
        </button>
      </div>
      {error ? (
        <p className="field-error">{error}</p>
      ) : value?.address ? (
        <p className={`mt-1 flex items-center gap-1 text-xs ${pinned ? 'text-primary' : 'text-[#B9770E]'}`}>
          <Icon name={pinned ? 'check-circle' : 'info'} size={13} />
          {pinned ? 'Location pinned on the map' : 'Pick a suggestion to pin the exact location (we will try to locate the text otherwise)'}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

function OsmAddressInput({ value, onChange, label, id, error, required, placeholder = 'Start typing an address…', hint }) {
  const autoId = useId();
  const inputId = id || autoId;
  const listId = `${inputId}-list`;
  const [text, setText] = useState(value?.address || '');
  const [dirty, setDirty] = useState(false);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounce(text, 550);
  const wrapRef = useRef(null);
  const { locating, locate } = useLocateMe((loc) => {
    setText(loc.address);
    setDirty(false);
    setOpen(false);
    onChange?.(loc);
  });

  // Sync when the parent replaces the value (e.g. reset / prefill).
  useEffect(() => {
    if ((value?.address || '') !== text && !dirty) setText(value?.address || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.address]);

  useEffect(() => {
    if (!dirty || debounced.trim().length < 3) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    setSearching(true);
    searchAddress(debounced, { signal: controller.signal })
      .then((rows) => {
        setResults(rows);
        setOpen(true);
        setActive(-1);
      })
      .catch(() => {
        if (!controller.signal.aborted) setResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
    return () => controller.abort();
  }, [debounced, dirty]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const select = (r) => {
    setText(r.address);
    setDirty(false);
    setOpen(false);
    setResults([]);
    onChange?.({ address: r.address, lat: r.lat, lng: r.lng });
  };

  const onKeyDown = (e) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      select(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <Shell
      id={inputId}
      label={label}
      required={required}
      hint={hint}
      error={error}
      value={value}
      locating={locating}
      onLocate={locate}
    >
      <div ref={wrapRef}>
        <Icon name="map-pin" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className={`input pl-10 pr-9 ${error ? 'input-error' : ''}`}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
            onChange?.({ address: e.target.value, lat: null, lng: null });
          }}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {searching ? <Spinner size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary" /> : null}
        {open && results.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
          >
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lng},${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(r)}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${i === active ? 'bg-primary-light' : 'hover:bg-slate-50'}`}
                >
                  <Icon name="map-pin" size={15} className="mt-0.5 text-primary" />
                  <span className="line-clamp-2 text-slate-700">{r.address}</span>
                </button>
              </li>
            ))}
            <li className="px-3 pb-1 pt-1.5 text-[10px] text-slate-400">Search by OpenStreetMap Nominatim</li>
          </ul>
        ) : null}
      </div>
    </Shell>
  );
}

function GoogleAddressInput(props) {
  const { isLoaded, loadError } = useGoogleMapsLoader();
  if (loadError) return <OsmAddressInput {...props} />;
  return <GooglePlacesField {...props} isLoaded={isLoaded} />;
}

function GooglePlacesField({ value, onChange, label, id, error, required, placeholder = 'Start typing an address…', hint, isLoaded }) {
  const autoId = useId();
  const inputId = id || autoId;
  const acRef = useRef(null);
  const [text, setText] = useState(value?.address || '');
  const { locating, locate } = useLocateMe((loc) => {
    setText(loc.address);
    onChange?.(loc);
  });

  useEffect(() => {
    setText(value?.address || '');
  }, [value?.address]);

  const onPlaceChanged = () => {
    const place = acRef.current?.getPlace?.();
    const loc = place?.geometry?.location;
    if (!loc) return;
    const address = place.formatted_address || place.name || text;
    setText(address);
    onChange?.({ address, lat: loc.lat(), lng: loc.lng() });
  };

  const input = (
    <input
      id={inputId}
      type="text"
      autoComplete="off"
      className={`input pl-10 ${error ? 'input-error' : ''}`}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange?.({ address: e.target.value, lat: null, lng: null });
      }}
      onKeyDown={(e) => {
        // Enter selects the highlighted prediction instead of submitting the form.
        if (e.key === 'Enter') e.preventDefault();
      }}
    />
  );

  return (
    <Shell
      id={inputId}
      label={label}
      required={required}
      hint={hint}
      error={error}
      value={value}
      locating={locating}
      onLocate={locate}
    >
      <Icon name="map-pin" size={17} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" />
      {isLoaded ? (
        <Autocomplete
          onLoad={(ac) => {
            acRef.current = ac;
          }}
          onPlaceChanged={onPlaceChanged}
          fields={['formatted_address', 'geometry', 'name']}
        >
          {input}
        </Autocomplete>
      ) : (
        input
      )}
    </Shell>
  );
}

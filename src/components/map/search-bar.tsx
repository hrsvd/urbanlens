"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Building2, Crosshair, MapPin, Route, Search, Trees, X } from "lucide-react";
import type { SearchItem } from "@/lib/types";

function ResultIcon({ kind }: { kind: string }) {
  if (/coordinate/.test(kind)) return <Crosshair aria-hidden="true" />;
  if (/intersection/.test(kind)) return <Route aria-hidden="true" />;
  if (/park|garden|playground|grass/.test(kind)) return <Trees aria-hidden="true" />;
  if (/building|apartments|office/.test(kind)) return <Building2 aria-hidden="true" />;
  return <MapPin aria-hidden="true" />;
}

function reset(
  setQuery: (q: string) => void,
  setResults: (r: SearchItem[]) => void,
  setOpen: (o: boolean) => void,
  setActiveIndex: (i: number) => void,
) {
  setQuery("");
  setResults([]);
  setOpen(false);
  setActiveIndex(0);
}

export function SearchBar({ onSelect }: { onSelect: (item: SearchItem) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [ambiguous, setAmbiguous] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const justSelectedRef = useRef(false);

  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const body = await response.json() as { results: SearchItem[]; ambiguous?: boolean };
        setResults(body.results);
        setAmbiguous(Boolean(body.ambiguous));
        setActiveIndex(0);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const choose = (item: SearchItem) => {
    justSelectedRef.current = true;
    setQuery(item.name);
    setResults([]);
    setOpen(false);
    setActiveIndex(0);
    onSelect(item);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (results.length === 1 || (!ambiguous && results[activeIndex])) {
      choose(results[activeIndex] ?? results[0]);
    } else if (results.length) {
      setOpen(true);
    }
  };

  const handleKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      reset(setQuery, setResults, setOpen, setActiveIndex);
      inputRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open && results.length) setOpen(true);
      setActiveIndex((index) => Math.min(results.length - 1, index + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    }
  };

  return (
    <div className="search-wrap">
      <form className="search-bar" onSubmit={handleSubmit} role="search">
        <Search aria-hidden="true" />
        <label className="sr-only" htmlFor="ul-search">Search Bengaluru streets and places</label>
        <input
          id="ul-search"
          ref={inputRef}
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (value.trim().length < 2) {
              setResults([]);
              setOpen(false);
            }
          }}
          onKeyDown={handleKeys}
          placeholder="Search a place, road, or paste lat,lon…"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="search-results"
          aria-activedescendant={open && results[activeIndex] ? `result-${activeIndex}` : undefined}
        />
        {loading && <span className="mini-loader" aria-label="Searching" />}
        {query && !loading && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              reset(setQuery, setResults, setOpen, setActiveIndex);
              inputRef.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </button>
        )}
        <kbd>⌘ K</kbd>
      </form>
      {open && (
        <div className="search-results" id="search-results" role="listbox">
          <div className="search-scope">
            <span>{ambiguous && results.length > 1 ? "Did you mean" : "All Bengaluru localities"}</span>
            <em>{results.length} {results.length === 1 ? "match" : "matches"}</em>
          </div>
          {results.length ? results.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              aria-label={`${item.name}, ${item.note ?? item.kind}${item.localityName ? `, ${item.localityName}` : ""}`}
              id={`result-${index}`}
              key={item.id}
              className={index === activeIndex ? "active" : ""}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(item)}
            >
              <ResultIcon kind={item.kind} />
              <span>
                <strong>{item.name}</strong>
                <em>{item.note ?? item.kind.replaceAll("_", " ")}</em>
              </span>
              <span className="result-locality-tag">
                {item.localityName && <small className="locality-tag">{item.localityName}</small>}
                <small>{item.latitude.toFixed(4)}° N</small>
              </span>
            </button>
          )) : (
            <div className="search-empty">
              <MapPin aria-hidden="true" />
              <p>No match found. Try a road name, landmark, or paste lat,lon coordinates.</p>
            </div>
          )}
          <footer>Offline OpenStreetMap index · fuzzy matching · no data sent to third parties</footer>
        </div>
      )}
    </div>
  );
}

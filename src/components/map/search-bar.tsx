"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Building2, MapPin, Search, Trees, X } from "lucide-react";
import type { SearchItem } from "@/lib/types";

function ResultIcon({ kind }: { kind: string }) {
  if (/park|garden|playground|grass/.test(kind)) return <Trees aria-hidden="true" />;
  if (/building|apartments|office/.test(kind)) return <Building2 aria-hidden="true" />;
  return <MapPin aria-hidden="true" />;
}

export function SearchBar({ onSelect }: { onSelect: (item: SearchItem) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const body = await response.json() as { results: SearchItem[] };
        setResults(body.results);
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
    setQuery(item.name);
    setOpen(false);
    onSelect(item);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (results[activeIndex]) choose(results[activeIndex]);
  };

  const handleKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open && event.key === "ArrowDown") setOpen(true);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(results.length - 1, index + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    }
    if (event.key === "Escape") setOpen(false);
  };

  return (
    <div className="search-wrap">
      <form className="search-bar" onSubmit={handleSubmit} role="search">
        <Search aria-hidden="true" />
        <label className="sr-only" htmlFor="hsr-search">Search HSR streets and places</label>
        <input
          id="hsr-search"
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
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={handleKeys}
          placeholder="Search HSR streets, parks, buildings…"
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
              setQuery("");
              setOpen(false);
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
            <span>Inside HSR boundary</span>
            <em>{results.length} matches</em>
          </div>
          {results.length ? results.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              id={`result-${index}`}
              key={item.id}
              className={index === activeIndex ? "active" : ""}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(item)}
            >
              <ResultIcon kind={item.kind} />
              <span><strong>{item.name}</strong><em>{item.kind.replaceAll("_", " ")}</em></span>
              <small>{item.latitude.toFixed(4)}° N</small>
            </button>
          )) : (
            <div className="search-empty">
              <MapPin aria-hidden="true" />
              <p>No locally indexed place found inside HSR.</p>
            </div>
          )}
          <footer>Search uses the pre-ingested OpenStreetMap index · no keystrokes leave this app</footer>
        </div>
      )}
    </div>
  );
}

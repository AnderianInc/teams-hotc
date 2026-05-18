import { useMemo, useState, useCallback } from "react";

export type DateRange = { from?: string; to?: string } | null;

export interface UseTableFiltersOptions {
  initialSearch?: string;
  initialChips?: Record<string, string>;
  initialFacets?: Record<string, string[]>;
  initialDateRange?: DateRange;
}

export function useTableFilters(opts: UseTableFiltersOptions = {}) {
  const [search, setSearch] = useState(opts.initialSearch ?? "");
  const [chips, setChips] = useState<Record<string, string>>(
    opts.initialChips ?? {}
  );
  const [facets, setFacets] = useState<Record<string, string[]>>(
    opts.initialFacets ?? {}
  );
  const [dateRange, setDateRange] = useState<DateRange>(
    opts.initialDateRange ?? null
  );

  const setChip = useCallback((key: string, value: string) => {
    setChips((c) => ({ ...c, [key]: value }));
  }, []);

  const toggleFacet = useCallback((key: string, value: string) => {
    setFacets((f) => {
      const cur = f[key] ?? [];
      const next = cur.includes(value)
        ? cur.filter((v) => v !== value)
        : [...cur, value];
      return { ...f, [key]: next };
    });
  }, []);

  const setFacet = useCallback((key: string, values: string[]) => {
    setFacets((f) => ({ ...f, [key]: values }));
  }, []);

  const clearAll = useCallback(() => {
    setSearch("");
    setChips({});
    setFacets({});
    setDateRange(null);
  }, []);

  const activeCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n++;
    n += Object.values(chips).filter((v) => v && v !== "all").length;
    n += Object.values(facets).reduce(
      (acc, arr) => acc + (arr?.length ?? 0),
      0
    );
    if (dateRange?.from || dateRange?.to) n++;
    return n;
  }, [search, chips, facets, dateRange]);

  return {
    search,
    setSearch,
    chips,
    setChip,
    setChips,
    facets,
    toggleFacet,
    setFacet,
    setFacets,
    dateRange,
    setDateRange,
    clearAll,
    activeCount,
  };
}

export type TableFiltersApi = ReturnType<typeof useTableFilters>;

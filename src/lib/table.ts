"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchSearch } from "./format";

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

export interface TableConfig<T> {
  /** Khoá duy nhất của dòng */
  getKey: (row: T) => string;
  /** Chuỗi dùng để tìm kiếm nhanh */
  searchText?: (row: T) => string;
  /** Điều kiện lọc nâng cao */
  filter?: (row: T) => boolean;
  /** Lấy giá trị so sánh khi sắp xếp theo cột */
  sortValue?: (row: T, key: string) => string | number | null | undefined;
  defaultSort?: SortState | null;
  pageSize?: number;
  /** Các state của bộ lọc, để tính lại khi thay đổi */
  filterDeps?: unknown[];
}

export function useTableState<T>(source: T[], config: TableConfig<T>) {
  const { getKey, defaultSort = null, pageSize: initialSize = 20 } = config;

  // giữ hàm trong ref để không phá vỡ memo khi caller viết inline
  const cfg = useRef(config);
  cfg.current = config;

  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<SortState | null>(defaultSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const filterDeps = config.filterDeps ?? [];

  /* ------------------------------ Lọc ------------------------------ */
  const filtered = useMemo(() => {
    const { searchText, filter } = cfg.current;
    let rows = source;
    if (filter) rows = rows.filter(filter);
    if (keyword.trim() && searchText) {
      rows = rows.filter((r) => matchSearch(searchText(r), keyword));
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, keyword, ...filterDeps]);

  /* --------------------------- Sắp xếp ----------------------------- */
  const sorted = useMemo(() => {
    const { sortValue } = cfg.current;
    if (!sort || !sortValue) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const na = va ?? "";
      const nb = vb ?? "";
      let r: number;
      if (typeof na === "number" && typeof nb === "number") r = na - nb;
      else r = String(na).localeCompare(String(nb), "vi");
      return sort.dir === "asc" ? r : -r;
    });
    return arr;
  }, [filtered, sort]);

  /* -------------------------- Phân trang --------------------------- */
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  // đổi từ khoá / bộ lọc thì về trang 1
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, ...filterDeps]);

  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  /* --------------------------- Sắp xếp ----------------------------- */
  const toggleSort = useCallback((key: string) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null; // bấm lần 3 -> bỏ sắp xếp
    });
  }, []);

  /* ---------------------------- Chọn ------------------------------- */
  const pageKeys = useMemo(
    () => pageRows.map((r) => cfg.current.getKey(r)),
    [pageRows],
  );

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const allPageSelected =
    pageKeys.length > 0 && pageKeys.every((k) => selectedSet.has(k));
  const somePageSelected =
    !allPageSelected && pageKeys.some((k) => selectedSet.has(k));

  const toggleRow = useCallback((key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const togglePage = useCallback(() => {
    setSelectedKeys((prev) => {
      const set = new Set(prev);
      const all = pageKeys.every((k) => set.has(k));
      if (all) pageKeys.forEach((k) => set.delete(k));
      else pageKeys.forEach((k) => set.add(k));
      return [...set];
    });
  }, [pageKeys]);

  const selectAll = useCallback(() => {
    setSelectedKeys(sorted.map((r) => cfg.current.getKey(r)));
  }, [sorted]);

  const clearSelection = useCallback(() => setSelectedKeys([]), []);

  /** Bỏ chọn những khoá không còn tồn tại (sau khi xoá) */
  useEffect(() => {
    const exist = new Set(source.map((r) => getKey(r)));
    setSelectedKeys((prev) => {
      const next = prev.filter((k) => exist.has(k));
      return next.length === prev.length ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  return {
    keyword,
    setKeyword,
    sort,
    setSort,
    toggleSort,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    total,
    rows: sorted,
    pageRows,
    selectedKeys,
    selectedSet,
    setSelectedKeys,
    toggleRow,
    togglePage,
    selectAll,
    clearSelection,
    allPageSelected,
    somePageSelected,
  };
}

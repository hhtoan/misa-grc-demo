"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconChartDots3,
  IconFilterOff,
  IconTarget,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  FilterCombobox,
  RiskBadge,
  SearchInput,
  Segments,
  Tooltip,
} from "@/components/ui";
import {
  ContentCard,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import { LEVEL_TONE, LevelDistributionBar } from "@/components/domain";
import { objectiveRepo, riskRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import { BSC_PERSPECTIVES } from "@/lib/domain/enums";
import type { RiskLevelValue } from "@/lib/domain/enums";
import {
  RISK_LEVEL_ORDER,
  residualLevelOf,
  residualScoreOf,
} from "@/lib/domain/risk-utils";
import type { Objective, Risk } from "@/lib/domain/schema";
import { formatMoney, matchSearch } from "@/lib/format";
import { cn } from "@/lib/cn";

type GroupBy = "perspective" | "level" | "unit";

const EMPTY_COUNT: Record<RiskLevelValue, number> = {
  "Thấp": 0,
  "Trung bình": 0,
  "Cao": 0,
  "Trọng yếu": 0,
};

export default function BanDoMucTieuScreen() {
  const router = useRouter();
  const lk = useLookups();

  const objectives = useCollection(objectiveRepo);
  const risks = useCollection(riskRepo);

  const [groupBy, setGroupBy] = useState<GroupBy>("perspective");
  const [keyword, setKeyword] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [onlyNoRisk, setOnlyNoRisk] = useState(false);

  /* ------------------- Gắn rủi ro vào mục tiêu ------------------- */

  const riskMap = useMemo(() => {
    const map = new Map<string, Risk[]>();
    risks.forEach((r) => {
      if (r.status === "Đã đóng" || r.status === "Từ chối") return;
      r.objectiveIds.forEach((oid) => {
        const arr = map.get(oid);
        if (arr) arr.push(r);
        else map.set(oid, [r]);
      });
    });
    map.forEach((arr) =>
      arr.sort(
        (a, b) =>
          RISK_LEVEL_ORDER[residualLevelOf(b)] * 100 +
          residualScoreOf(b) -
          (RISK_LEVEL_ORDER[residualLevelOf(a)] * 100 + residualScoreOf(a))
      )
    );
    return map;
  }, [risks]);

  function maxLevelOf(id: string): RiskLevelValue | null {
    const rows = riskMap.get(id) ?? [];
    if (rows.length === 0) return null;
    return rows.reduce<RiskLevelValue>((acc, r) => {
      const lv = residualLevelOf(r);
      return RISK_LEVEL_ORDER[lv] > RISK_LEVEL_ORDER[acc] ? lv : acc;
    }, "Thấp");
  }

  /* --------------------------- Lọc ------------------------------ */

  const filtered = useMemo(
    () =>
      objectives.filter((o) => {
        if (unitId && o.unitId !== unitId) return false;
        if (
          keyword.trim() &&
          !matchSearch(`${o.code} ${o.name} ${o.perspective}`, keyword)
        )
          return false;
        const lv = maxLevelOf(o.id);
        if (onlyHigh && lv !== "Cao" && lv !== "Trọng yếu") return false;
        if (onlyNoRisk && (riskMap.get(o.id)?.length ?? 0) > 0) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objectives, unitId, keyword, onlyHigh, onlyNoRisk, riskMap]
  );

  /* -------------------------- Nhóm ------------------------------ */

  const groups = useMemo(() => {
    const map = new Map<string, Objective[]>();

    const keyOf = (o: Objective) =>
      groupBy === "perspective"
        ? o.perspective
        : groupBy === "level"
          ? o.level
          : lk.unitName(o.unitId);

    filtered.forEach((o) => {
      const k = keyOf(o);
      const arr = map.get(k);
      if (arr) arr.push(o);
      else map.set(k, [o]);
    });

    const order =
      groupBy === "perspective" ? [...BSC_PERSPECTIVES] : [...map.keys()];

    return order
      .filter((k) => map.has(k))
      .concat([...map.keys()].filter((k) => !order.includes(k)))
      .map((k) => ({ key: k, items: map.get(k) ?? [] }));
  }, [filtered, groupBy, lk]);

  /* -------------------------- Thống kê -------------------------- */

  const counts = useMemo(() => {
    const out = { ...EMPTY_COUNT };
    const seen = new Set<string>();
    filtered.forEach((o) => {
      (riskMap.get(o.id) ?? []).forEach((r) => {
        if (seen.has(r.id)) return;
        seen.add(r.id);
        out[residualLevelOf(r)] += 1;
      });
    });
    return out;
  }, [filtered, riskMap]);

  const noRiskCount = filtered.filter(
    (o) => (riskMap.get(o.id)?.length ?? 0) === 0
  ).length;

  const filterCount =
    (unitId ? 1 : 0) + (onlyHigh ? 1 : 0) + (onlyNoRisk ? 1 : 0);

  function resetFilter() {
    setUnitId(null);
    setOnlyHigh(false);
    setOnlyNoRisk(false);
    setKeyword("");
  }

  /* ------------------------------ Render ------------------------ */

  return (
    <PageContainer>
      <PageHeader
        title="Bản đồ mục tiêu - rủi ro"
        actions={
          filterCount > 0 && (
            <Button
              variant="text"
              icon={<IconFilterOff size={16} />}
              onClick={resetFilter}
            >
              Xoá lọc ({filterCount})
            </Button>
          )
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          {/* ------------------------ Bộ lọc ------------------------ */}
          <ContentCard className="flex flex-wrap items-center gap-2">
            <Segments
              items={[
                { key: "perspective", label: "Theo khía cạnh BSC" },
                { key: "level", label: "Theo cấp mục tiêu" },
                { key: "unit", label: "Theo đơn vị" },
              ]}
              value={groupBy}
              onChange={(k) => setGroupBy(k as GroupBy)}
            />

            <span className="mx-1 h-6 w-px bg-border-light" />

            <SearchInput
              value={keyword}
              onChange={setKeyword}
              placeholder="Tìm mục tiêu"
              width={240}
            />
            <FilterCombobox
              label="Đơn vị:"
              options={lk.unitOptions}
              value={unitId}
              onChange={setUnitId}
              searchable
              width={210}
            />
            <Checkbox
              label="Chỉ mục tiêu có rủi ro Cao trở lên"
              checked={onlyHigh}
              onChange={(e) => {
                setOnlyHigh(e.target.checked);
                if (e.target.checked) setOnlyNoRisk(false);
              }}
            />
            <Checkbox
              label="Chỉ mục tiêu chưa gắn rủi ro"
              checked={onlyNoRisk}
              onChange={(e) => {
                setOnlyNoRisk(e.target.checked);
                if (e.target.checked) setOnlyHigh(false);
              }}
            />
          </ContentCard>

          {/* ----------------------- Tổng quan ---------------------- */}
          <ContentCard>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[14px] font-semibold text-text-primary">
                Phân bố rủi ro đang bảo vệ {filtered.length} mục tiêu
              </h2>
              {noRiskCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[12px] text-lv-medium-text">
                  <IconAlertTriangle size={14} />
                  {noRiskCount} mục tiêu chưa được nhận diện rủi ro
                </span>
              )}
            </div>
            <LevelDistributionBar counts={counts} />
          </ContentCard>

          {/* ------------------------ Bản đồ ------------------------ */}
          {filtered.length === 0 ? (
            <ContentCard>
              <EmptyState
                icon={<IconChartDots3 size={24} />}
                title="Không có mục tiêu phù hợp"
                description="Thử bỏ bớt điều kiện lọc phía trên."
              />
            </ContentCard>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-[14px] font-semibold text-text-primary">
                    {g.key}
                  </h2>
                  <Badge tone="neutral" size="sm">
                    {g.items.length} mục tiêu
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {g.items.map((o) => (
                    <ObjectiveCard
                      key={o.id}
                      objective={o}
                      risks={riskMap.get(o.id) ?? []}
                      maxLevel={maxLevelOf(o.id)}
                      unitName={lk.unitName(o.unitId)}
                      ownerName={lk.employeeName(o.ownerId)}
                      onOpenRisk={(code) =>
                        router.push(`/rui-ro/so-dang-ky/${code}`)
                      }
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </PageBody>
    </PageContainer>
  );
}

/* ================================================================== */

function ObjectiveCard({
  objective,
  risks,
  maxLevel,
  unitName,
  ownerName,
  onOpenRisk,
}: {
  objective: Objective;
  risks: Risk[];
  maxLevel: RiskLevelValue | null;
  unitName: string;
  ownerName: string;
  onOpenRisk: (code: string) => void;
}) {
  const totalLoss = risks.reduce((s, r) => s + (r.estimatedLoss ?? 0), 0);

  return (
    <div
      className={cn(
        "misa-card flex flex-col gap-2.5 border-l-4 p-3",
        maxLevel === "Trọng yếu"
          ? "border-l-lv-critical-text"
          : maxLevel === "Cao"
            ? "border-l-lv-high-text"
            : maxLevel === "Trung bình"
              ? "border-l-lv-medium-text"
              : maxLevel === "Thấp"
                ? "border-l-lv-low-text"
                : "border-l-border-neutral"
      )}
    >
      {/* Đầu thẻ */}
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctrl bg-brand-light text-brand">
          <IconTarget size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-5 font-semibold text-text-primary">
            <span className="text-brand">{objective.code}</span> {objective.name}
          </p>
          <p className="truncate text-[12px] text-text-secondary">
            {objective.perspective} - {objective.level} - {unitName} -{" "}
            {ownerName}
          </p>
        </div>
        <div className="flex w-[110px] shrink-0 flex-col items-end gap-1">
          {maxLevel ? (
            <Tooltip content="Mức rủi ro cao nhất đang ảnh hưởng tới mục tiêu">
              <Badge tone={LEVEL_TONE[maxLevel]} dot>
                {maxLevel}
              </Badge>
            </Tooltip>
          ) : (
            <Badge tone="neutral">Chưa gắn</Badge>
          )}
          <span className="flex w-full items-center gap-1.5">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: `${objective.progress}%` }}
              />
            </span>
            <span className="text-[11px] text-text-secondary">
              {objective.progress}%
            </span>
          </span>
        </div>
      </div>

      {/* Danh sách rủi ro */}
      {risks.length === 0 ? (
        <div className="flex items-center gap-2 rounded-ctrl border border-dashed border-border-neutral px-3 py-2.5 text-[12px] text-text-hint">
          <IconAlertTriangle size={15} className="shrink-0" />
          Chưa nhận diện rủi ro nào ảnh hưởng tới mục tiêu này
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {risks.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpenRisk(r.code)}
              className="group/row flex items-center gap-2 rounded-ctrl px-2 py-1.5 text-left transition-colors hover:bg-[#FAFAFA]"
            >
              <span className="w-[120px] shrink-0 text-[12px] font-medium text-brand">
                {r.code}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">
                {r.name}
              </span>
              {r.isZeroTolerance && (
                <Badge tone="danger" size="sm">
                  KKN
                </Badge>
              )}
              <RiskBadge
                level={residualLevelOf(r)}
                score={residualScoreOf(r)}
              />
              <IconArrowRight
                size={14}
                className="shrink-0 text-icon-neutral opacity-0 transition-opacity group-hover/row:opacity-100"
              />
            </button>
          ))}
        </div>
      )}

      {/* Chân thẻ */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-light pt-2 text-[11px] text-text-secondary">
        <span>
          {risks.length} rủi ro đang theo dõi
          {objective.target ? ` - Chỉ tiêu: ${objective.target}` : ""}
        </span>
        {totalLoss > 0 && (
          <span>
            Tổn thất ước tính{" "}
            <b className="text-text-primary">{formatMoney(totalLoss)}</b> VNĐ
          </span>
        )}
      </div>
    </div>
  );
}

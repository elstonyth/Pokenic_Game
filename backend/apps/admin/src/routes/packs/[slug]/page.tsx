import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Heading,
  Text,
  Table,
  Button,
  Input,
  Label,
  Select,
  StatusBadge,
  FocusModal,
  Checkbox,
  toast,
  clx,
} from '@medusajs/ui';
import { ArrowLeft } from '@medusajs/icons';
import type {
  AdminPack,
  PackOddsResponse,
  PublishedOdds,
} from '../../../lib/packs-api';
import { RARITIES } from '@acme/odds-math';
import {
  useCards,
  usePackOdds,
  usePacks,
  useSaveMembers,
  useSaveRarities,
  useSaveTopHits,
  useUpdatePack,
} from '../../../lib/queries';
import { rm } from '../../../lib/format';
import {
  mapOddsToRows,
  rowsToRarityEntries,
  type EditRow,
} from '../../../lib/odds-rows';
import { resolveImageUrl } from '../../../lib/image-url';

const PackOddsEditorPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { slug = '' } = useParams();

  const { data, isError: loadError } = usePackOdds(slug);
  const saveRarities = useSaveRarities();
  const saveMembersMut = useSaveMembers();
  const saveTopHits = useSaveTopHits();
  const [rows, setRows] = useState<EditRow[] | null>(null);
  const saving = saveRarities.isPending;
  const packTitle = data?.pack.title ?? '';
  const packStatus = data?.pack.status ?? '';

  // Full pack row (the status toggle must send the complete write payload —
  // the odds snapshot only carries slug/title/category/status).
  const { data: packsList = null } = usePacks();
  const fullPack = packsList?.find((p) => p.slug === slug) ?? null;
  const updatePack = useUpdatePack();
  // Backend-provided aggregate (the UI no longer sees weights) — the server
  // remains authoritative (rejects activating an empty/zero-weight pool).
  const canActivate = data?.rollable === true;

  const toggleStatus = async () => {
    if (!fullPack || updatePack.isPending) return;
    const next = packStatus === 'active' ? 'draft' : 'active';
    try {
      await updatePack.mutateAsync({ ...fullPack, status: next });
      toast.success(
        next === 'active'
          ? t('packs.editor.activated')
          : t('packs.editor.deactivated'),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  // Seed (and reseed) the editable buffer from the server snapshot, during render
  // (not an effect) per react.dev "you might not need an effect". React Query keeps
  // a stable `data` reference until the content changes, so this reseeds only on
  // initial load and after our explicit post-save-members invalidation — never
  // clobbering in-progress edits.
  const [seededFrom, setSeededFrom] = useState<PackOddsResponse | undefined>(
    undefined,
  );
  if (data && data !== seededFrom) {
    setSeededFrom(data);
    setRows(mapOddsToRows(data.odds));
  }

  // Prize-pool membership — which cards belong to this pack.
  const [poolOpen, setPoolOpen] = useState(false);
  const { data: allCards = null } = useCards({ enabled: poolOpen });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const savingMembers = saveMembersMut.isPending;

  const openPool = () => {
    setSelected(new Set((rows ?? []).map((r) => r.card_id)));
    setPoolOpen(true);
  };

  const toggleCard = (handle: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });

  // Top-hit toggle — optimistic buffer flip + immediate save of the complete
  // flagged set (idempotent). Reverted on failure. Deliberately no query
  // invalidation (see useSaveTopHits) so in-progress win-rate edits survive.
  const toggleTopHit = async (cardId: string) => {
    if (!rows || saveTopHits.isPending) return;
    const prev = rows;
    const next = rows.map((x) =>
      x.card_id === cardId ? { ...x, topHit: !x.topHit } : x,
    );
    setRows(next);
    try {
      await saveTopHits.mutateAsync({
        slug,
        card_ids: next.filter((x) => x.topHit).map((x) => x.card_id),
      });
    } catch (err) {
      setRows(prev);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const saveMembers = async () => {
    try {
      const res = await saveMembersMut.mutateAsync({
        slug,
        card_ids: Array.from(selected),
      });
      toast.success(
        t('packs.pool.saved', { added: res.added, removed: res.removed }),
      );
      setPoolOpen(false);
      // Invalidation (in the hook) refetches the odds → the seeding effect reseeds.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const setRow = (cardId: string, patch: Partial<EditRow>) =>
    setRows(
      (prev) =>
        prev?.map((r) => (r.card_id === cardId ? { ...r, ...patch } : r)) ??
        null,
    );

  // Rarity-only save. 🔒 Win-rate weights and locks never pass through the
  // UI — the backend merges the incoming rarities with the STORED lock state
  // (a locked card's win rate survives any rarity edit verbatim).
  async function save() {
    if (!rows || saving) return;
    try {
      await saveRarities.mutateAsync({
        slug,
        entries: rowsToRarityEntries(rows),
      });
      toast.success(t('packs.editor.saved'));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    }
  }

  if (loadError) {
    return (
      <Container className="p-6">
        <Text className="text-ui-fg-subtle">{t('packs.editor.loadError')}</Text>
      </Container>
    );
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-start justify-between gap-4 px-6 py-4">
        <div>
          <button
            type="button"
            onClick={() => navigate('/packs')}
            className="text-ui-fg-subtle hover:text-ui-fg-base mb-2 flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('packs.editor.back')}
          </button>
          <div className="flex items-center gap-2">
            <Heading level="h2">{packTitle || slug}</Heading>
            {packStatus && (
              <StatusBadge color={packStatus === 'active' ? 'green' : 'grey'}>
                {packStatus}
              </StatusBadge>
            )}
          </div>
          <Text className="text-ui-fg-subtle mt-1 max-w-2xl" size="small">
            {t('packs.editor.subtitle')}
          </Text>
        </div>
        <div className="flex items-center gap-x-2">
          <Button
            size="small"
            variant="secondary"
            onClick={openPool}
            disabled={rows === null}
          >
            {t('packs.pool.manage')}
          </Button>
          {packStatus === 'draft' ? (
            <Button
              size="small"
              variant="primary"
              onClick={toggleStatus}
              isLoading={updatePack.isPending}
              disabled={!fullPack || !canActivate}
              title={!canActivate ? t('packs.editor.activateNeedsPool') : ''}
            >
              {t('packs.editor.activate')}
            </Button>
          ) : (
            packStatus === 'active' && (
              <Button
                size="small"
                variant="secondary"
                onClick={toggleStatus}
                isLoading={updatePack.isPending}
                disabled={!fullPack}
              >
                {t('packs.editor.deactivate')}
              </Button>
            )
          )}
        </div>
      </div>

      {/* Draft banner — a draft pack is invisible to customers; say so, and
          say what unblocks activation, right where the operator is working. */}
      {packStatus === 'draft' && (
        <div className="bg-ui-tag-orange-bg text-ui-tag-orange-text px-6 py-2.5 text-sm">
          {canActivate
            ? t('packs.editor.draftReadyBanner')
            : t('packs.editor.draftBanner')}
        </div>
      )}

      {/* Published odds — the PUBLIC percentages players see. Display-only,
          fully decoupled from the per-card win rates in the table below. */}
      {fullPack && (
        <PublishedOddsSection
          key={fullPack.slug}
          pack={fullPack}
          saving={updatePack.isPending}
          onSave={async (po) => {
            try {
              await updatePack.mutateAsync({ ...fullPack, published_odds: po });
              toast.success(t('packs.published.saved'));
            } catch (err) {
              toast.error(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      )}

      {rows === null ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-subtle">…</Text>
        </div>
      ) : (
        <>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t('packs.editor.card')}</Table.HeaderCell>
                <Table.HeaderCell>{t('packs.editor.rarity')}</Table.HeaderCell>
                <Table.HeaderCell className="text-center">
                  {t('packs.editor.topHit')}
                </Table.HeaderCell>
                <Table.HeaderCell className="text-right">
                  {t('packs.editor.value')}
                </Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((r) => {
                return (
                  <Table.Row key={r.card_id}>
                    <Table.Cell>
                      <div className="flex items-center gap-3">
                        <img
                          src={resolveImageUrl(r.image)}
                          alt=""
                          className="h-10 w-8 shrink-0 rounded object-contain"
                        />
                        <div className="flex flex-col">
                          <span className="max-w-[18rem] truncate">
                            {r.name}
                          </span>
                          {r.stock !== null && r.stock < 0 ? (
                            // Wins keep counting below 0 — this is how many
                            // physical units the operator owes winners.
                            <span className="text-ui-tag-red-text text-xs font-medium">
                              {t('packs.editor.unitsOwed', {
                                count: Math.abs(r.stock),
                              })}
                            </span>
                          ) : (
                            r.stock === 0 && (
                              <span className="text-ui-tag-orange-text text-xs">
                                {t('packs.editor.buybackOnly')}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Select
                        size="small"
                        value={r.rarity}
                        onValueChange={(v) => setRow(r.card_id, { rarity: v })}
                      >
                        <Select.Trigger className="w-32">
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          {RARITIES.map((rarity) => (
                            <Select.Item key={rarity} value={rarity}>
                              {rarity}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </Table.Cell>
                    <Table.Cell className="text-center">
                      <Checkbox
                        checked={r.topHit}
                        disabled={saveTopHits.isPending}
                        aria-label={t('packs.editor.topHit')}
                        onCheckedChange={() => void toggleTopHit(r.card_id)}
                      />
                    </Table.Cell>
                    <Table.Cell className="text-ui-fg-subtle text-right tabular-nums">
                      {rm(r.market_value)}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>

          <div className="flex items-center justify-end px-6 py-4">
            <Button
              variant="primary"
              onClick={save}
              isLoading={saving}
              disabled={saving}
            >
              {t('packs.editor.save')}
            </Button>
          </div>
        </>
      )}

      <FocusModal
        open={poolOpen}
        onOpenChange={(open) => {
          if (!open) setPoolOpen(false);
        }}
      >
        <FocusModal.Content>
          <FocusModal.Header>
            <div className="flex items-center justify-end gap-x-2">
              <Button
                size="small"
                variant="secondary"
                onClick={() => setPoolOpen(false)}
              >
                {t('packs.pool.cancel')}
              </Button>
              <Button
                size="small"
                onClick={saveMembers}
                isLoading={savingMembers}
              >
                {t('packs.pool.save')}
              </Button>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col items-center overflow-auto p-10">
            <div className="flex w-full max-w-[640px] flex-col gap-y-4">
              <div>
                <FocusModal.Title asChild>
                  <Heading level="h2">{t('packs.pool.title')}</Heading>
                </FocusModal.Title>
                <FocusModal.Description asChild>
                  <Text className="text-ui-fg-subtle mt-1" size="small">
                    {t('packs.pool.subtitle', { count: selected.size })}
                  </Text>
                </FocusModal.Description>
              </div>
              {allCards === null ? (
                <Text className="text-ui-fg-subtle">…</Text>
              ) : allCards.length === 0 ? (
                <Text className="text-ui-fg-subtle">
                  {t('packs.pool.noCards')}
                </Text>
              ) : (
                <div className="divide-y rounded-lg border">
                  {allCards.map((c) => (
                    <label
                      key={c.handle}
                      className="hover:bg-ui-bg-base-hover flex cursor-pointer items-center gap-3 px-4 py-2"
                    >
                      <Checkbox
                        checked={selected.has(c.handle)}
                        onCheckedChange={() => toggleCard(c.handle)}
                      />
                      <img
                        src={resolveImageUrl(c.image)}
                        alt=""
                        className="h-9 w-7 shrink-0 rounded object-contain"
                      />
                      <div className="flex flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {c.name}
                        </span>
                        <span className="text-ui-fg-subtle text-xs">
                          {[c.grader, c.grade].filter(Boolean).join(' ') || '—'}{' '}
                          · {rm(c.priceBreakdown.marketMyr)}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>
    </Container>
  );
};

// ── Published odds (PUBLIC) ──────────────────────────────────────────────────
// The percentages players see on the storefront pack page ({ overall, per-tier }).
// Display-only: saving here never touches the per-card win-rate weights.
// Mounted with key={slug}, only once fullPack is loaded, so the initial state
// can seed straight from props.
const PublishedOddsSection = ({
  pack,
  saving,
  onSave,
}: {
  pack: AdminPack;
  saving: boolean;
  onSave: (po: PublishedOdds) => Promise<void>;
}) => {
  const { t } = useTranslation();
  const [overall, setOverall] = useState<string>(
    pack.published_odds ? String(pack.published_odds.overall) : '100',
  );
  const [tiers, setTiers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      RARITIES.map((r) => [
        r,
        pack.published_odds?.tiers[r] !== undefined
          ? String(pack.published_odds.tiers[r])
          : '',
      ]),
    ),
  );

  const validPct = (v: string) =>
    v.trim() === '' ||
    (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100);
  const allValid =
    overall.trim() !== '' &&
    validPct(overall) &&
    RARITIES.every((r) => validPct(tiers[r] ?? ''));
  const sum =
    Math.round(
      RARITIES.reduce((s, r) => s + (Number(tiers[r]) || 0), 0) * 100,
    ) / 100;

  const save = () =>
    onSave({
      overall: Number(overall),
      tiers: Object.fromEntries(
        RARITIES.filter((r) => (tiers[r] ?? '').trim() !== '').map((r) => [
          r,
          Number(tiers[r]),
        ]),
      ),
    });

  return (
    <div className="px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Heading level="h3">{t('packs.published.title')}</Heading>
          <Text className="text-ui-fg-subtle mt-1 max-w-2xl" size="small">
            {t('packs.published.subtitle')}
          </Text>
        </div>
        <Button
          size="small"
          variant="secondary"
          onClick={save}
          isLoading={saving}
          disabled={!allValid}
        >
          {t('packs.published.save')}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <div className="flex flex-col gap-y-1">
          <Label size="xsmall" weight="plus">
            {t('packs.published.overall')}
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={overall}
            onChange={(e) => setOverall(e.target.value)}
          />
        </div>
        {RARITIES.map((r) => (
          <div key={r} className="flex flex-col gap-y-1">
            <Label size="xsmall" weight="plus">
              {r}
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              placeholder="—"
              value={tiers[r] ?? ''}
              onChange={(e) => setTiers((m) => ({ ...m, [r]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <Text
        size="small"
        className={clx(
          'mt-2',
          sum === 100 ? 'text-ui-fg-subtle' : 'text-ui-tag-orange-text',
        )}
      >
        {t('packs.published.sum', { sum })}
      </Text>
      {!pack.published_odds && (
        <Text size="small" className="text-ui-fg-subtle mt-1">
          {t('packs.published.notSet')}
        </Text>
      )}
    </div>
  );
};

export default PackOddsEditorPage;

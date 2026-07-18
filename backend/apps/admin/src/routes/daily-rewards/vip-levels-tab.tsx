import { useState } from 'react';
import {
  Button,
  Input,
  Label,
  Select,
  Switch,
  Table,
  Text,
} from '@medusajs/ui';
import { useVipLevels, useSaveVipLevels, useDailyBoxes } from '../../lib/queries';
import type { VipLevelDTO } from '../../lib/queries';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import {
  validateVipLevelsClient,
  type VipLevelRow,
} from './vip-levels-validate-client';

// One editable ladder row. `level` is NOT stored — it's the array index + 1,
// renumbered on every structural change (insert/delete/append).
interface Row extends VipLevelRow {
  localId: string;
}

let nextId = 0;
const rowFromDTO = (l: VipLevelDTO): Row => ({
  localId: `vl-${nextId++}`,
  thresholdInput: String(l.spend_threshold),
  voucherInput: String(l.voucher_amount),
  boxTier: l.box_tier,
  frameUnlock: l.frame_unlock,
  referralInput: String(l.direct_referral_pct),
});
const blankRow = (boxTier: string): Row => ({
  localId: `vl-${nextId++}`,
  thresholdInput: '0',
  voucherInput: '0',
  boxTier,
  frameUnlock: false,
  referralInput: '1',
});

const snapshotOf = (rows: Row[]): string =>
  JSON.stringify(
    rows.map((r) => [
      r.thresholdInput,
      r.voucherInput,
      r.boxTier,
      r.frameUnlock,
      r.referralInput,
    ]),
  );

export const VipLevelsTab = () => {
  const { data, isError } = useVipLevels();
  const { data: boxesData } = useDailyBoxes();
  const save = useSaveVipLevels();

  const [seededFrom, setSeededFrom] = useState<{ levels: VipLevelDTO[] } | undefined>(
    undefined,
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [reason, setReason] = useState('');

  if (data && data !== seededFrom) {
    setSeededFrom(data);
    const initial = data.levels.map(rowFromDTO);
    setRows(initial);
    setSavedSnapshot(snapshotOf(initial));
  }

  if (isError) return <Text className="text-ui-fg-subtle p-6">Failed to load the VIP ladder.</Text>;
  if (!data) return <LoadingSkeleton />;

  const tiers = (boxesData?.boxes ?? []).map((b) => b.tier);
  const fallbackTier = tiers[0] ?? 'a';
  const dirty = snapshotOf(rows) !== savedSnapshot;
  const errors = validateVipLevelsClient(rows);
  const reasonValid = reason.trim().length > 0;
  const canSave = !save.isPending && dirty && errors.length === 0 && reasonValid;

  const setRow = (localId: string, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)),
    );
  const insertAt = (index: number) =>
    setRows((prev) => {
      const next = prev.slice();
      next.splice(index, 0, blankRow(fallbackTier));
      return next;
    });
  const removeAt = (index: number) =>
    setRows((prev) => prev.filter((_, i) => i !== index));

  async function onSave() {
    if (!canSave) return;
    const levels: VipLevelDTO[] = rows.map((r, i) => ({
      level: i + 1,
      spend_threshold: Number(r.thresholdInput) || 0,
      voucher_amount: Number(r.voucherInput) || 0,
      box_tier: r.boxTier,
      frame_unlock: r.frameUnlock,
      direct_referral_pct: Number(r.referralInput) || 0,
    }));
    try {
      const res = await save.mutateAsync({ levels, reason: reason.trim() });
      const reseeded = res.levels.map(rowFromDTO);
      setRows(reseeded);
      setSavedSnapshot(snapshotOf(reseeded));
      setReason('');
    } catch {
      // useSaveVipLevels.onError toasts the backend message.
    }
  }

  return (
    <div className="flex flex-col gap-y-4 px-6 py-4">
      <Text className="text-ui-fg-subtle" size="small">
        The per-user VIP ladder. Level is the row order; thresholds must start at
        0 and strictly increase. A frame can only unlock on a decade level.
      </Text>

      {errors.length > 0 && (
        <div className="rounded-lg border border-ui-border-error bg-ui-bg-base p-3">
          {errors.map((e) => (
            <Text key={e} className="text-ui-fg-error" size="small">
              {e}
            </Text>
          ))}
        </div>
      )}

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Level</Table.HeaderCell>
            <Table.HeaderCell>Threshold (RM)</Table.HeaderCell>
            <Table.HeaderCell>Voucher (RM)</Table.HeaderCell>
            <Table.HeaderCell>Box tier</Table.HeaderCell>
            <Table.HeaderCell>Frame</Table.HeaderCell>
            <Table.HeaderCell>Referral %</Table.HeaderCell>
            <Table.HeaderCell>Rows</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((r, i) => (
            <Table.Row key={r.localId}>
              <Table.Cell>{i + 1}</Table.Cell>
              <Table.Cell>
                <Input
                  value={r.thresholdInput}
                  disabled={i === 0}
                  onChange={(e) =>
                    setRow(r.localId, { thresholdInput: e.target.value })
                  }
                />
              </Table.Cell>
              <Table.Cell>
                <Input
                  value={r.voucherInput}
                  onChange={(e) =>
                    setRow(r.localId, { voucherInput: e.target.value })
                  }
                />
              </Table.Cell>
              <Table.Cell>
                <Select
                  value={r.boxTier}
                  onValueChange={(v) => setRow(r.localId, { boxTier: v })}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {tiers.map((t) => (
                      <Select.Item key={t} value={t}>
                        {t}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Table.Cell>
              <Table.Cell>
                <Switch
                  checked={r.frameUnlock}
                  onCheckedChange={(v) => setRow(r.localId, { frameUnlock: v })}
                />
              </Table.Cell>
              <Table.Cell>
                <Input
                  value={r.referralInput}
                  onChange={(e) =>
                    setRow(r.localId, { referralInput: e.target.value })
                  }
                />
              </Table.Cell>
              <Table.Cell>
                <div className="flex gap-x-1">
                  <Button size="small" variant="secondary" onClick={() => insertAt(i)}>
                    + Above
                  </Button>
                  <Button size="small" variant="secondary" onClick={() => insertAt(i + 1)}>
                    + Below
                  </Button>
                  <Button size="small" variant="danger" onClick={() => removeAt(i)}>
                    Delete
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      <div className="flex items-center gap-x-3">
        <Button
          variant="secondary"
          onClick={() => setRows((prev) => [...prev, blankRow(fallbackTier)])}
        >
          Append level
        </Button>
        {dirty && (
          <Text className="text-ui-fg-subtle" size="small">
            Unsaved changes
          </Text>
        )}
      </div>

      <div className="flex items-end gap-x-3">
        <div className="flex-1">
          <Label htmlFor="vip-levels-reason">Reason (audit trail)</Label>
          <Input
            id="vip-levels-reason"
            placeholder="e.g. Rebalance mid-tier thresholds"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button variant="primary" onClick={onSave} isLoading={save.isPending} disabled={!canSave}>
          Save ladder
        </Button>
      </div>
    </div>
  );
};

export default VipLevelsTab;

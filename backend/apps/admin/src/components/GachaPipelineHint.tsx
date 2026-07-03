import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Text } from '@medusajs/ui';

// The gacha inventory pipeline in one glance — product (stock) → gacha card →
// pack. Rendered on all three authoring pages so operators always know which
// stage they're on and where an item goes next. (Creating a product does NOT
// put it in a pack — that confusion is exactly what this strip prevents.)
const STEPS = [
  { key: 'product', href: '/products/from-pricecharting' },
  { key: 'card', href: '/cards' },
  { key: 'pack', href: '/packs' },
] as const;

export type PipelineStep = (typeof STEPS)[number]['key'];

export function GachaPipelineHint({ current }: { current: PipelineStep }) {
  const { t } = useTranslation();
  return (
    <div className="bg-ui-bg-subtle flex flex-wrap items-center gap-x-2 gap-y-1 px-6 py-2.5">
      <Text
        size="xsmall"
        weight="plus"
        className="text-ui-fg-muted uppercase tracking-wide"
      >
        {t('pipeline.label')}
      </Text>
      {STEPS.map((s, i) => (
        <span key={s.key} className="flex items-center gap-x-2">
          {i > 0 && (
            <span aria-hidden className="text-ui-fg-muted">
              →
            </span>
          )}
          {s.key === current ? (
            <Text size="xsmall" weight="plus" className="text-ui-fg-base">
              {i + 1}. {t(`pipeline.${s.key}`)}
            </Text>
          ) : (
            <Link
              to={s.href}
              className="text-ui-fg-subtle hover:text-ui-fg-base text-xs underline-offset-2 hover:underline"
            >
              {i + 1}. {t(`pipeline.${s.key}`)}
            </Link>
          )}
        </span>
      ))}
    </div>
  );
}

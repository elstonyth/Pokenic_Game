import { model } from "@medusajs/framework/utils";

// DeliveryOrderItem — join between a DeliveryOrder and the Pull being shipped.
// One order → many items. pull_id is NOT globally unique (a canceled order
// returns the pull to the vault, where it can be re-requested), but a pull can
// only be in ONE active order at a time — enforced primarily by the
// Pull.status === "vaulted" gate in requestDeliveryWorkflow, and backed by a
// partial-unique index on (delivery_order_id, pull_id) so the same pull can
// never be added to one order twice.
export const DeliveryOrderItem = model
  .define("delivery_order_item", {
    id: model.id().primaryKey(),
    delivery_order_id: model.text(),
    pull_id: model.text(),
  })
  .indexes([
    {
      name: "IDX_delivery_order_item_order_id",
      on: ["delivery_order_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_delivery_order_item_pull_id",
      on: ["pull_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_delivery_order_item_order_pull_unique",
      on: ["delivery_order_id", "pull_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default DeliveryOrderItem;

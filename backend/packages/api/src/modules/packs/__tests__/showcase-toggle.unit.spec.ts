import { validateShowcaseRequest } from "../../../api/store/vault/[id]/showcase/route";

type PullRow = { customer_id: string; status: string };

describe("showcase toggle validation", () => {
  const CUSTOMER = "cust_abc";
  const OTHER = "cust_xyz";

  it("returns ok for a vaulted pull owned by the caller", () => {
    const pull: PullRow = { customer_id: CUSTOMER, status: "vaulted" };
    expect(validateShowcaseRequest(pull, CUSTOMER)).toBe("ok");
  });

  it("returns not_found when the pull does not exist", () => {
    expect(validateShowcaseRequest(undefined, CUSTOMER)).toBe("not_found");
  });

  it("returns forbidden when the pull belongs to a different customer", () => {
    const pull: PullRow = { customer_id: OTHER, status: "vaulted" };
    expect(validateShowcaseRequest(pull, CUSTOMER)).toBe("forbidden");
  });

  it("returns not_vaulted when the pull is bought_back", () => {
    const pull: PullRow = { customer_id: CUSTOMER, status: "bought_back" };
    expect(validateShowcaseRequest(pull, CUSTOMER)).toBe("not_vaulted");
  });
});

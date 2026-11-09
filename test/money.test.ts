import { describe, expect, it } from "vitest";
import { convertMinor, currencyDecimals, formatMinor, parseAmountToMinor } from "@/lib/money";

describe("currency decimals", () => {
  it("uses 2 decimals for INR and USD, 0 for JPY, 3 for KWD", () => {
    expect(currencyDecimals("INR")).toBe(2);
    expect(currencyDecimals("USD")).toBe(2);
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("KWD")).toBe(3);
  });
});

describe("parsing a typed amount into minor units", () => {
  it("reads ₹1,250.5 as 125050 paise", () => {
    expect(parseAmountToMinor("1,250.5", "INR")).toBe(125050);
  });

  it("reads a whole yen amount as the same number", () => {
    expect(parseAmountToMinor("1200", "JPY")).toBe(1200);
  });

  it("rejects more decimals than the currency allows", () => {
    expect(parseAmountToMinor("12.345", "USD")).toBeNull();
    expect(parseAmountToMinor("12.5", "JPY")).toBeNull();
  });

  it("rejects text and negative numbers", () => {
    expect(parseAmountToMinor("abc", "INR")).toBeNull();
    expect(parseAmountToMinor("-5", "INR")).toBeNull();
  });
});

describe("converting into the group base currency", () => {
  it("turns $10.00 at 83.25 INR per USD into ₹832.50", () => {
    expect(convertMinor(1000, "USD", "INR", 83.25)).toBe(83250);
  });

  it("turns ¥1000 at 0.56 INR per JPY into ₹560.00 across different decimal counts", () => {
    expect(convertMinor(1000, "JPY", "INR", 0.56)).toBe(56000);
  });

  it("rounds a fraction of a paisa to the nearest paisa", () => {
    expect(convertMinor(333, "USD", "INR", 83.3333)).toBe(27750);
  });
});

describe("formatting minor units for display", () => {
  it("shows 125050 paise as ₹1,250.50", () => {
    expect(formatMinor(125050, "INR")).toBe("₹1,250.50");
  });
});

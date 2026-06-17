/**
 * Spec-based tests — Module 1: auto-match tutor theo giới tính ưa thích.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pickTutorByGender, preferredGenderToStyle } from "./tutor-matching";

const tutors = [
  { id: "t-nam", gender_style: "nam" as const, is_active: true },
  { id: "t-nu", gender_style: "nu" as const, is_active: true },
  { id: "t-inactive", gender_style: "nam" as const, is_active: false },
];

describe("preferredGenderToStyle", () => {
  it("thay→nam, co→nu, khác→null", () => {
    assert.equal(preferredGenderToStyle("thay"), "nam");
    assert.equal(preferredGenderToStyle("co"), "nu");
    assert.equal(preferredGenderToStyle(null), null);
  });
});

describe("pickTutorByGender", () => {
  it("chọn tutor active đúng giới tính", () => {
    assert.equal(pickTutorByGender(tutors, "thay"), "t-nam");
    assert.equal(pickTutorByGender(tutors, "co"), "t-nu");
  });

  it("không khớp giới tính → fallback tutor active đầu tiên", () => {
    const onlyFemale = [{ id: "t-nu", gender_style: "nu" as const, is_active: true }];
    assert.equal(pickTutorByGender(onlyFemale, "thay"), "t-nu");
  });

  it("không có giới tính ưa thích → fallback tutor active đầu tiên", () => {
    assert.equal(pickTutorByGender(tutors, null), "t-nam");
  });

  it("bỏ qua tutor inactive", () => {
    const inactiveMale = [
      { id: "t-inactive", gender_style: "nam" as const, is_active: false },
      { id: "t-nu", gender_style: "nu" as const, is_active: true },
    ];
    assert.equal(pickTutorByGender(inactiveMale, "thay"), "t-nu");
  });

  it("không có tutor → null", () => {
    assert.equal(pickTutorByGender([], "thay"), null);
  });

  it("hỗ trợ _id (mongoose doc)", () => {
    assert.equal(
      pickTutorByGender([{ _id: 123, gender_style: "nam", is_active: true }], "thay"),
      "123",
    );
  });
});

/**
 * Spec-based tests — Module 8: cá nhân hóa nội dung theo sở thích + top weak topics.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  chooseWeakPracticeTopic,
  interestMatchScore,
  parseInterests,
  rankLessonsByInterest,
  topWeakTopics,
} from "./personalization-ranking";

describe("parseInterests", () => {
  it("tách & chuẩn hóa thường", () => {
    assert.deepEqual(parseInterests("Bóng đá, Game/Âm nhạc"), [
      "bóng đá",
      "game",
      "âm nhạc",
    ]);
  });
  it("rỗng → []", () => {
    assert.deepEqual(parseInterests(null), []);
    assert.deepEqual(parseInterests("  "), []);
  });
});

describe("interestMatchScore", () => {
  it("đếm số sở thích khớp tiêu đề/chủ đề", () => {
    const lesson = { lesson_title: "Toán bóng đá", topic: "thống kê" };
    assert.equal(interestMatchScore(lesson, ["bóng đá", "game"]), 1);
    assert.equal(interestMatchScore(lesson, ["bóng đá", "thống kê"]), 2);
  });
  it("không sở thích → 0", () => {
    assert.equal(interestMatchScore({ lesson_title: "x" }, []), 0);
  });
});

describe("rankLessonsByInterest", () => {
  const lessons = [
    { lesson_title: "Phân số cơ bản", topic: "phân số" },
    { lesson_title: "Ứng dụng bóng đá", topic: "thống kê" },
    { lesson_title: "Hình học", topic: "tam giác" },
  ];

  it("bài khớp sở thích lên đầu, giữ thứ tự tương đối còn lại", () => {
    const ranked = rankLessonsByInterest(lessons, "bóng đá");
    assert.equal(ranked[0].lesson_title, "Ứng dụng bóng đá");
    assert.equal(ranked[1].lesson_title, "Phân số cơ bản");
    assert.equal(ranked[2].lesson_title, "Hình học");
  });

  it("không sở thích → giữ nguyên thứ tự (bản sao)", () => {
    const ranked = rankLessonsByInterest(lessons, "");
    assert.deepEqual(
      ranked.map((l) => l.lesson_title),
      lessons.map((l) => l.lesson_title),
    );
    assert.notEqual(ranked, lessons);
  });

  it("stable: nhiều bài cùng điểm giữ thứ tự gốc", () => {
    const ranked = rankLessonsByInterest(lessons, "không-khớp-gì");
    assert.deepEqual(
      ranked.map((l) => l.lesson_title),
      lessons.map((l) => l.lesson_title),
    );
  });
});

describe("topWeakTopics", () => {
  const masteries = [
    { topic: "Phân số", mastery_level: 40 },
    { topic: "Hình học", mastery_level: 30 },
    { topic: "Đại số", mastery_level: 80 },
    { topic: "", mastery_level: 10 },
    { topic: "Số học", mastery_level: 55 },
  ];

  it("lấy top-N yếu nhất, bỏ topic rỗng, tăng dần", () => {
    const weak = topWeakTopics(masteries, 3);
    assert.deepEqual(weak, [
      { topic: "Hình học", mastery: 30 },
      { topic: "Phân số", mastery: 40 },
      { topic: "Số học", mastery: 55 },
    ]);
  });

  it("limit 0 → rỗng", () => {
    assert.deepEqual(topWeakTopics(masteries, 0), []);
  });
});

describe("chooseWeakPracticeTopic (M7 luyện theo điểm yếu)", () => {
  const masteries = [
    { topic: "Phân số", mastery_level: 40 },
    { topic: "Hình học", mastery_level: 30 },
  ];
  it("chọn chủ đề yếu nhất", () => {
    assert.equal(chooseWeakPracticeTopic(masteries), "Hình học");
  });
  it("tránh trùng chủ đề hiện tại", () => {
    assert.equal(chooseWeakPracticeTopic(masteries, "Hình học"), "Phân số");
  });
  it("không có dữ liệu yếu → fallback chủ đề hiện tại", () => {
    assert.equal(chooseWeakPracticeTopic([], "Đại số"), "Đại số");
    assert.equal(chooseWeakPracticeTopic([], null), null);
  });
});

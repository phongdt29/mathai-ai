import { Target, Map, Lightbulb, BarChart3, Bot, Trophy, Calculator, Rocket, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const features: { icon: LucideIcon; title: string; description: string; color: string; bg: string }[] = [
  {
    icon: Target,
    title: 'Đánh giá năng lực đầu vào',
    description: 'Xác định năng lực hiện tại để bắt đầu từ đúng điểm phù hợp với từng học sinh.',
    color: 'from-pink-500 to-rose-500',
    bg: 'bg-pink-50',
  },
  {
    icon: Map,
    title: 'Lộ trình học cá nhân hóa',
    description: 'Xây dựng kế hoạch học tập theo trình độ, mục tiêu và tốc độ tiến bộ thực tế.',
    color: 'from-violet-500 to-purple-500',
    bg: 'bg-violet-50',
  },
  {
    icon: Lightbulb,
    title: 'Giải bài tập có hướng dẫn',
    description: 'AI hỗ trợ giải thích từng bước thay vì chỉ cung cấp đáp án cuối cùng.',
    color: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50',
  },
  {
    icon: BarChart3,
    title: 'Theo dõi tiến độ học tập',
    description: 'Dashboard trực quan giúp theo dõi kết quả, mức độ thành thạo và thói quen học tập.',
    color: 'from-emerald-500 to-green-500',
    bg: 'bg-emerald-50',
  },
  {
    icon: Bot,
    title: 'Trợ lý học tập AI',
    description: 'Hỏi đáp nhanh những vướng mắc trong quá trình học và luyện tập toán.',
    color: 'from-cyan-500 to-blue-500',
    bg: 'bg-cyan-50',
  },
  {
    icon: Trophy,
    title: 'Bài học theo mục tiêu',
    description: 'Ưu tiên nội dung học theo mục tiêu ngắn hạn và dài hạn của từng học sinh.',
    color: 'from-yellow-500 to-amber-500',
    bg: 'bg-yellow-50',
  },
];

const stats = [
  { value: '10K+', label: 'Bài tập' },
  { value: 'AI', label: 'Hỗ trợ 24/7' },
  { value: '1-12', label: 'Lớp học' },
  { value: '98%', label: 'Hài lòng' },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-purple-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/50 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-3xl"><Calculator className="w-8 h-8 text-indigo-600" /></span>
            <h1 className="text-2xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              MathAI
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="rounded-full border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition hover:bg-white hover:shadow-sm"
            >
              Đăng nhập
            </a>
            <a
              href="/register"
              className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 hover:scale-[1.02]"
            >
              Bắt đầu miễn phí
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-200/40 to-purple-200/40 blur-3xl" />
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-1.5 text-sm font-medium text-indigo-700 mb-6">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
          </span>
          Nền tảng học toán AI #1 Việt Nam
        </div>

        <h2 className="mb-6 text-4xl font-extrabold leading-tight md:text-6xl">
          Học toán trở nên{' '}
          <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
            thú vị & dễ dàng
          </span>
          <br />
          hơn bao giờ hết!
        </h2>

        <p className="mx-auto mb-10 max-w-2xl text-lg leading-8 text-gray-600">
          MathAI sử dụng trí tuệ nhân tạo để hiểu cách bạn học, tạo lộ trình riêng,
          giải thích từng bước và đồng hành cùng bạn trên hành trình chinh phục toán học.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <a
            href="/register"
            className="group rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-3.5 text-base font-semibold text-white shadow-xl shadow-indigo-500/25 transition hover:shadow-indigo-500/40 hover:scale-[1.02]"
          >
            Bắt đầu học ngay — Miễn phí
            <span className="ml-2 inline-block transition group-hover:translate-x-1">→</span>
          </a>
          <a
            href="#features"
            className="rounded-full border-2 border-gray-200 px-8 py-3.5 text-base font-semibold text-gray-700 transition hover:border-indigo-300 hover:bg-white"
          >
            Xem tính năng
          </a>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-gray-100 backdrop-blur">
              <div className="text-3xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h3 className="text-3xl font-extrabold text-gray-900">
              Tất cả những gì bạn cần
            </h3>
            <p className="mt-3 text-gray-600">
              Một nền tảng — đầy đủ công cụ để chinh phục toán học
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className={`group relative overflow-hidden rounded-2xl ${feature.bg} p-6 ring-1 ring-gray-200/50 transition hover:shadow-lg hover:scale-[1.01]`}
              >
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} text-white shadow-sm`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h4 className="mb-2 text-lg font-bold text-gray-900">{feature.title}</h4>
                <p className="text-sm leading-relaxed text-gray-600">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="rounded-3xl bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-16 text-white shadow-2xl shadow-indigo-500/25">
            <h3 className="text-3xl font-extrabold md:text-4xl">
              Sẵn sàng chinh phục toán học?
            </h3>
            <p className="mx-auto mt-4 max-w-xl text-lg text-indigo-100">
              Tham gia cùng hàng nghìn học sinh đang học toán hiệu quả hơn mỗi ngày với MathAI.
            </p>
            <a
              href="/register"
              className="mt-8 inline-block rounded-full bg-white px-8 py-3.5 text-base font-semibold text-indigo-600 shadow-lg transition hover:shadow-xl hover:scale-[1.02]"
            >
              Đăng ký miễn phí ngay
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/50 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-sm text-gray-500">
          <Calculator className="w-4 h-4 inline mr-1" /> © 2026 MathAI. Nền tảng học toán online sử dụng AI.
        </div>
      </footer>
    </main>
  );
}

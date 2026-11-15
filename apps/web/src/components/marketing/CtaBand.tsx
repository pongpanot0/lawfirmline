import { Reveal } from './Reveal';
export function CtaBand({ title }: { title: string }) {
  return (
    <Reveal>
      <section className="mx-auto my-20 max-w-[1240px] px-4 md:px-6">
        <div className="rounded-2xl bg-mk-ink px-6 py-14 text-center md:py-16">
          <h2 className="font-display text-3xl font-semibold text-mk-paper md:text-4xl">{title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-mk-cta-muted">ทดลองใช้ฟรี 30 วัน ไม่ต้องใช้บัตรเครดิต</p>
          <a
            href="/register"
            className="btn-primary mt-8 inline-block whitespace-nowrap rounded-lg bg-mk-paper px-8 py-3.5 font-semibold text-mk-ink"
          >
            ทดลองใช้ฟรี 30 วัน
          </a>
        </div>
      </section>
    </Reveal>
  );
}

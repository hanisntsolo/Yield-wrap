import { Link } from 'react-router-dom';
import Hero from '../components/landing/Hero';
import ImpactCounter from '../components/landing/ImpactCounter';
import HowItWorks from '../components/landing/HowItWorks';
import Footer from '../components/landing/Footer';
import AdBanner from '../components/AdBanner';
import Icon from '../components/common/Icon';
import useMediaQuery from '../hooks/useMediaQuery';

const AUDIENCES = [
  { role: 'donor', icon: 'utensils', title: 'For donors', body: 'List surplus in a minute, get AI-ranked NGO matches and follow every delivery live.', cta: 'Donate Food' },
  { role: 'ngo', icon: 'building', title: 'For NGOs', body: 'Receive offers that fit your capacity and food types, plus a 7-day demand forecast.', cta: 'Join as NGO' },
  { role: 'volunteer', icon: 'truck', title: 'For volunteers', body: 'Pick up nearby tasks with optimised routes, climb the leaderboard and log your impact.', cta: 'Volunteer' },
];

export default function Landing() {
  const desktop = useMediaQuery('(min-width: 768px)');
  return (
    <>
      <Hero />
      <ImpactCounter />
      <HowItWorks />

      <section className="py-16 sm:py-20" aria-labelledby="audiences-title">
        <div className="container-page">
          <h2 id="audiences-title" className="text-center text-2xl font-extrabold sm:text-3xl">
            One network, three ways to help
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <article key={a.role} className="card flex flex-col p-6 transition-transform hover:-translate-y-1">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary">
                  <Icon name={a.icon} />
                </span>
                <h3 className="mt-4 text-lg font-bold">{a.title}</h3>
                <p className="mt-2 flex-1 text-sm text-slate-500">{a.body}</p>
                <Link to={`/register?role=${a.role}`} className="btn btn-outline-primary mt-5 self-start">
                  {a.cta} <Icon name="arrow-right" size={16} />
                </Link>
              </article>
            ))}
          </div>
          <div className="mt-12 flex justify-center">
            <AdBanner slot={desktop ? 'leaderboard' : 'mobile'} page="landing" />
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-20" aria-labelledby="sponsor-title">
        <div className="container-page">
          <div className="card flex flex-col gap-6 overflow-hidden bg-gradient-to-br from-accent-light via-white to-primary-light p-6 sm:p-10 md:flex-row md:items-center">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-[#B9770E]">New · Packaging ads</p>
              <h2 id="sponsor-title" className="mt-2 text-2xl font-extrabold sm:text-3xl">
                Sponsor packaging, not just banners
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                Donate 100 packets and 50 carry your sticker for free. The other 50 are sponsor slots that local businesses fill with ad credits,
                and the NGOs that receive them earn a share. Posters at NGO kitchens and digital ads too.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
              <Link to="/register?role=business" className="btn btn-primary">
                <Icon name="megaphone" size={16} /> Advertise with us
              </Link>
              <Link to="/register?role=donor" className="btn btn-secondary">
                <Icon name="package" size={16} /> Donate with your brand
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-primary">
        <div className="container-page flex flex-col items-start gap-5 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-white">Have surplus food right now?</h2>
            <p className="mt-1 text-sm text-white/80">It takes less than a minute to list it — we will handle the rest.</p>
          </div>
          <Link to="/register?role=donor" className="btn btn-lg btn-accent">
            <Icon name="utensils" size={18} /> Donate Food
          </Link>
        </div>
      </section>
      <Footer />
    </>
  );
}

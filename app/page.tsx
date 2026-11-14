'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Menu, Users, X } from 'lucide-react'
import { Logo } from '@/components/plank-ui'

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return <div className="landing-page">
    <header className="landing-nav">
      <Logo href="/" />
      <nav>
        <a href="#how">How it works</a><a href="#communities">Why Plank</a><Link href="/login">Log in</Link><Link href="/start" className="button primary nav-cta">Start a group <ArrowRight size={15} /></Link>
        <button className="mobile-menu-trigger" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
      </nav>
    </header>
    {menuOpen && <div className="mobile-menu-panel" role="dialog" aria-label="Main menu">
      <button className="mobile-menu-close" onClick={closeMenu} aria-label="Close menu"><X size={20} /></button>
      <a href="#how" onClick={closeMenu}>How it works</a><a href="#communities" onClick={closeMenu}>Who it&apos;s for</a><a href="#faq" onClick={closeMenu}>FAQ</a>
      <Link href="/login" onClick={closeMenu}>Log in</Link><Link href="/start" onClick={closeMenu} className="button primary wide">Start a group</Link>
    </div>}
    <main>
      <section className="landing-hero">
        <div className="hero-copy"><span className="eyebrow">Money for the people</span><h1>Community money,<br /><span>out in the open.</span></h1>
          <p>Collect dues, see who has paid, and show everyone where the money went. No screenshots. No arguments.</p>
          <div className="hero-actions"><Link href="/start" className="button primary">Start a group <ArrowRight size={17} /></Link><a href="#how" className="text-button">See how it works <ArrowRight size={15} /></a></div>
          <div className="trust"><div className="trust-avatars"><span>PL</span><span>NK</span><span>OK</span></div><span>Made for groups that<br />look out for each other.</span></div>
        </div>
        <div className="hero-visual">
          <div className="float-note note-one"><span className="note-icon green"><Check size={14} /></span><span><b>Clear records</b><small>Every payment in one place</small></span></div>
          <div className="phone-card"><div className="phone-top"><span className="brand-mini">plank</span><span className="phone-dot" /></div>
            <p className="eyebrow">Your group</p><h3>Good morning,<br />treasurer</h3>
            <div className="phone-total"><span>Group contributions</span><strong>All in one place</strong><small>Easy to check and share</small></div>
            <div className="phone-progress"><div><b>Payment details</b><span>See each member&apos;s page</span></div></div>
            <div className="phone-members"><div><span className="avatar tiny">M</span><b>Group member</b><span>Payment status</span></div><div><span className="avatar tiny">M</span><b>Group member</b><span>Payment status</span></div><div><span className="avatar tiny">M</span><b>Group member</b><span>Payment status</span></div></div>
          </div>
          <div className="float-note note-two"><span className="note-icon cream"><Users size={14} /></span><span><b>Made for groups</b><small>Everyone stays in the loop</small></span></div>
        </div>
      </section>
      <section className="landing-section familiar"><div className="section-intro"><span className="eyebrow">Sound familiar?</span><h2>The hard part isn&apos;t<br />collecting. It&apos;s trust.</h2></div>
        <div className="familiar-grid"><div className="familiar-card">Payments are hard to find when you need them.</div><div className="familiar-card">The treasurer is tired of chasing people one by one.</div><div className="familiar-card">Nobody knows where the money went.</div></div>
        <p className="trust-line">The problem isn&apos;t the money. It&apos;s trust.</p>
      </section>
      <section id="how" className="landing-section how-modern"><div className="section-intro"><span className="eyebrow">How Plank works</span><h2>Four simple steps.<br />No guesswork.</h2></div>
        <div className="steps-grid"><div className="step-card"><b>01</b><h3>Create your group.</h3><p>Set the amount and the date.</p></div><div className="step-card"><b>02</b><h3>Add your members.</h3><p>Give each person a personal payment page.</p></div><div className="step-card"><b>03</b><h3>Record payments.</h3><p>Keep payment records clear and up to date.</p></div><div className="step-card"><b>04</b><h3>Share the ledger.</h3><p>Everyone can see money in and money out.</p></div></div>
      </section>
      <section id="why" className="landing-section"><div className="section-intro"><span className="eyebrow">No confusion, no chasing</span><h2>Everything your group needs<br />to stay in order.</h2></div>
        <div className="feature-grid"><div><span className="feature-number">01</span><h3>Collect with ease</h3><p>Give every member a simple page to check their payment details.</p></div><div><span className="feature-number">02</span><h3>See the full picture</h3><p>Everyone can see what has come in, what has gone out, and what remains.</p></div><div><span className="feature-number">03</span><h3>Keep a clear record</h3><p>Save group payments and share the ledger with everyone.</p></div></div>
      </section>
      <section id="communities" className="landing-section communities"><div className="section-intro"><span className="eyebrow">Made for your community</span><h2>One simple place<br />for group money.</h2></div>
        <div className="community-grid"><div><span className="feature-number">01</span><h3>Estates</h3><p>Keep dues and shared costs clear.</p></div><div><span className="feature-number">02</span><h3>Churches</h3><p>Track group contributions together.</p></div><div><span className="feature-number">03</span><h3>Unions</h3><p>Make group records easy to check.</p></div></div>
      </section>
      <section className="ledger-showcase"><div><span className="eyebrow">Open and clear</span><h2>Keep a clear record<br />of every naira.</h2><p>Choose who can see your group ledger. It shows money in, money out, and the balance.</p><Link href="/start" className="button primary">Start a group <ArrowRight size={17} /></Link></div>
        <div className="ledger-paper"><p><span>Money in</span><strong>Group records</strong></p><p><span>Money out</span><strong>Shared costs</strong></p><p><span>Balance</span><strong>Always clear</strong></p></div>
      </section>
      <section id="faq" className="landing-section faq-section"><div className="section-intro"><span className="eyebrow">Questions</span><h2>Good to know.</h2></div><div className="faq-list"><details><summary>Who can start a group?</summary><p>Any treasurer who wants to keep group money clear.</p></details><details><summary>Can members see the group record?</summary><p>Yes. Share the public group link with everyone.</p></details><details><summary>Can I add members later?</summary><p>Yes. Add and manage members from your overview.</p></details></div></section>
      <section className="landing-cta"><span className="eyebrow">Ready to begin?</span><h2>Make group money clear.</h2><Link href="/start" className="button primary">Start a group <ArrowRight size={17} /></Link></section>
    </main>
    <footer className="landing-footer"><Logo href="/" /><span>Simple group money for people who care.</span><Link href="/login">Log in</Link></footer>
  </div>
}

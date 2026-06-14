import React, { useState } from 'react';

const LANGS = [{ value: 'python', label: 'Python' }, { value: 'javascript', label: 'JavaScript' }, { value: 'java', label: 'Java' }, { value: 'c', label: 'C' }, { value: 'cpp', label: 'C++' }];

const EntryPage: React.FC<{ onStart: (name: string, email: string, lang: string) => void }> = ({ onStart }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [lang, setLang] = useState('python');
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (name.trim()) onStart(name.trim(), email.trim(), lang); };

  return (
    <div className="entry-page"><div className="entry-card">
      <h1>CORTEX</h1><p className="entry-subtitle">Coding Interview</p>
      <p className="entry-welcome">Welcome! Before we begin, please introduce yourself.</p>
      <form onSubmit={submit}>
        <div className="form-group"><label htmlFor="name">Name *</label><input id="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" required autoFocus /></div>
        <div className="form-group"><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" /></div>
        <div className="form-group"><label htmlFor="lang">Preferred Language</label><select id="lang" value={lang} onChange={e => setLang(e.target.value)}>{LANGS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div>
        <button type="submit" className="entry-button" disabled={!name.trim()}>Enter Interview Room</button>
      </form>
    </div></div>
  );
};
export default EntryPage;

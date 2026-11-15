import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Mail, Phone, MapPin, Clock, Send, CheckCircle2, MessageSquare } from 'lucide-react';
import { Footer } from '../components/Footer';

export const ContactPage: React.FC = () => {
  const { navigateTo } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('Ticket Inquiry');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setName('');
      setEmail('');
      setMessage('');
      setSubmitted(false);
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
      <div className="max-w-md mx-auto px-4 py-6 flex-1 w-full">
        {/* Back navigation */}
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-[#FACC15] mb-6 cursor-pointer transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Events</span>
        </button>

        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#FACC15] bg-[#FACC15]/10 px-2.5 py-1 rounded-full border border-[#FACC15]/20 inline-block">
              Support & Contact Us
            </span>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Get in Touch with Universal Band
            </h1>
            <p className="text-sm text-gray-400 leading-relaxed">
              Have questions about an upcoming event, ticket purchase, or wristband activation? Our team is available 7 days a week.
            </p>
          </div>

          {/* Contact Direct Cards */}
          <div className="grid gap-3">
            <div className="bg-[#141414] border border-white/10 rounded-2xl p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#FACC15]/10 text-[#FACC15] border border-[#FACC15]/30 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">Customer Support Email</span>
                <a href="mailto:Tetelophokwane90@gmail.com" className="text-xs font-bold text-white hover:text-[#FACC15] hover:underline truncate block">
                  Tetelophokwane90@gmail.com
                </a>
                <span className="text-[10px] text-gray-500 block">Response time: within 2 hours</span>
              </div>
            </div>

            <div className="bg-[#141414] border border-white/10 rounded-2xl p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">Direct Phone & WhatsApp</span>
                <a href="tel:+27763046653" className="text-xs font-bold text-white hover:text-emerald-400 hover:underline block">
                  +27 76 304 6653
                </a>
                <span className="text-[10px] text-gray-500 block">Mon – Sun: 08:00 – 22:00 SAST</span>
              </div>
            </div>

            <div className="bg-[#141414] border border-white/10 rounded-2xl p-4 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">Headquarters & Office</span>
                <p className="text-xs font-bold text-white">
                  890 Leeufontein , Marble Hall, 0459
                </p>
              </div>
            </div>
          </div>

          {/* Contact Inquiry Form */}
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#FACC15]" />
              <span>Send Us an Inquiry</span>
            </h2>

            {submitted ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Thank you! Your message has been sent. A Universal Band representative will get back to you shortly.</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-300 mb-1">Your Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Thabo Ndlovu"
                    className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. you@example.co.za"
                    className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-300 mb-1">Inquiry Topic</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-[#FACC15]"
                  >
                    <option value="Ticket Inquiry">Ticket Inquiry & Purchase Assistance</option>
                    <option value="Refund Request">Refund or Event Postponement</option>
                    <option value="Promoter Partnership">Host Event / Become a Promoter</option>
                    <option value="Wristband Help">Smart Band NFC Assistance</option>
                    <option value="Other">Other Question</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-300 mb-1">Your Message</label>
                  <textarea
                    required
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe how we can assist you..."
                    className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-yellow-400/20 active:scale-98"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Inquiry</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

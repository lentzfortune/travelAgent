"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import airplane from "./assets/airplane.png";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

const SESSION_MESSAGES_KEY = "travel-agent-session-messages";

export default function Home() {
  const [value, setValue] = useState("");
  const [days, setDays] = useState("5");
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [outboundDate, setOutboundDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [adults, setAdults] = useState("1");
  const [children, setChildren] = useState("0");
  const [preferences, setPreferences] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  useEffect(() => {
    let savedMessages: ChatMessage[] = [];
    try {
      const savedValue = sessionStorage.getItem(SESSION_MESSAGES_KEY);
      if (savedValue) {
        const parsed: unknown = JSON.parse(savedValue);
        if (Array.isArray(parsed)) savedMessages = parsed as ChatMessage[];
      }
    } catch {
      sessionStorage.removeItem(SESSION_MESSAGES_KEY);
    }

    const hydrationTimer = window.setTimeout(() => {
      setMessages(savedMessages);
      setIsHistoryLoading(false);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  async function sendMessage(message: string) {
    if (!message || isLoading) return;

    setError("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: messages }),
      });
      const data = (await response.json()) as {
        answer?: string;
        messages?: ChatMessage[];
        error?: string;
      };
      if (!response.ok || !data.answer || !data.messages) {
        throw new Error(data.error ?? "The travel agent could not respond.");
      }

      sessionStorage.setItem(
        SESSION_MESSAGES_KEY,
        JSON.stringify(data.messages),
      );
      setMessages(data.messages);
      setValue("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleInitialSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const preferenceText = preferences.trim()
      ? ` My preferences are: ${preferences.trim()}.`
      : "";
    const message =
      `Can you plan me a ${days}-day trip from ${departure.toUpperCase()} ` +
      `to ${arrival.toUpperCase()}, departing on ${outboundDate} and returning on ${returnDate}, ` +
      `with ${adults} adults and ${children} children?` +
      preferenceText;
    void sendMessage(message);
  }

  function handleFollowUpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(value.trim());
  }

  const isFirstSearch = !isHistoryLoading && messages.length === 0;
  const initialSearchIsValid =
    Number(days) > 0 &&
    /^[A-Za-z]{3}$/.test(departure) &&
    /^[A-Za-z]{3}$/.test(arrival) &&
    Boolean(outboundDate) &&
    Boolean(returnDate) &&
    returnDate >= outboundDate &&
    Number(adults) > 0 &&
    Number(children) >= 0;

  return (
    <main id="home">
      <section className="chat-layout">
        <div className="goal-panel">
          <Image
            className="airplane"
            src={airplane}
            alt=""
            aria-hidden="true"
            priority
          />

          {isFirstSearch ? (
            <form onSubmit={handleInitialSubmit}>
              <p className="eyebrow">Plan your next trip</p>
              <h1>Where would you like to go?</h1>

              <div className="trip-form-grid">
                <div className="form-field trip-days">
                  <label htmlFor="days">Trip length</label>
                  <div className="input-suffix">
                    <input
                      id="days"
                      type="number"
                      min="1"
                      max="30"
                      value={days}
                      onChange={(event) => setDays(event.target.value)}
                      disabled={isLoading}
                      required
                    />
                    <span>days</span>
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="departure">From</label>
                  <input
                    id="departure"
                    type="text"
                    inputMode="text"
                    maxLength={3}
                    pattern="[A-Za-z]{3}"
                    placeholder="JFK"
                    value={departure}
                    onChange={(event) => setDeparture(event.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="arrival">To</label>
                  <input
                    id="arrival"
                    type="text"
                    inputMode="text"
                    maxLength={3}
                    pattern="[A-Za-z]{3}"
                    placeholder="LAX"
                    value={arrival}
                    onChange={(event) => setArrival(event.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="outbound-date">Outbound date</label>
                  <input
                    id="outbound-date"
                    type="date"
                    value={outboundDate}
                    onChange={(event) => {
                      const nextOutboundDate = event.target.value;
                      setOutboundDate(nextOutboundDate);
                      if (returnDate && returnDate < nextOutboundDate) {
                        setReturnDate("");
                      }
                    }}
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="return-date">Return date</label>
                  <input
                    id="return-date"
                    type="date"
                    min={outboundDate || undefined}
                    value={returnDate}
                    onChange={(event) => setReturnDate(event.target.value)}
                    disabled={isLoading || !outboundDate}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="adults">Adults</label>
                  <input
                    id="adults"
                    type="number"
                    min="1"
                    max="9"
                    value={adults}
                    onChange={(event) => setAdults(event.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="children">Children</label>
                  <input
                    id="children"
                    type="number"
                    min="0"
                    max="8"
                    value={children}
                    onChange={(event) => setChildren(event.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <label htmlFor="preferences">Anything else? (optional)</label>
              <textarea
                id="preferences"
                placeholder="e.g. Relaxing pace, beach time, and a mid-range budget"
                rows={3}
                value={preferences}
                onChange={(event) => setPreferences(event.target.value)}
                disabled={isLoading}
              />

              <button
                type="submit"
                disabled={!initialSearchIsValid || isLoading}
              >
                {isLoading ? "Planning…" : "Plan my trip"}
              </button>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={handleFollowUpSubmit}>
              <p className="eyebrow">Continue planning</p>
              <h1>What would you like to change?</h1>
              <label htmlFor="userInput">Message your travel agent</label>
              <textarea
                id="userInput"
                name="userInput"
                placeholder="Ask about flights, dates, budgets, or itinerary changes"
                rows={5}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={isLoading || isHistoryLoading}
              />
              <button
                type="submit"
                disabled={!value.trim() || isLoading || isHistoryLoading}
              >
                {isLoading ? "Planning…" : "Send message"}
              </button>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>

        <aside className="history-panel" aria-labelledby="history-heading">
          <div className="history-header">
            <p className="eyebrow">Your chats</p>
            <h2 id="history-heading">Conversation history</h2>
          </div>
          {isHistoryLoading ? (
            <div className="empty-history">
              <p>Loading conversation…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-history">
              <span aria-hidden="true">✦</span>
              <p>Your travel conversations will appear here.</p>
            </div>
          ) : (
            <div className="message-list" aria-live="polite">
              {messages.map((message) => (
                <article
                  className={`message message-${message.role}`}
                  key={message.id}
                >
                  <strong>
                    {message.role === "user" ? "You" : "Travel agent"}
                  </strong>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

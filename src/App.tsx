import { useEffect, useMemo, useRef, useState } from "react";
import {
  factorItems,
  factorMeta,
  getQuestions,
  itemScores,
  rawToSten,
  type AgeGroup,
  type FactorCode,
  type OptionKey,
  type Sex,
} from "./test-data";

type Screen = "setup" | "test" | "result" | "history";
type Answers = Record<number, OptionKey>;
type FactorResult = { code: FactorCode; raw: number; sten: number };
type SavedResult = {
  id: string;
  date: string;
  sex: Sex;
  ageGroup: AgeGroup;
  factors: FactorResult[];
};
type Draft = { sex: Sex; ageGroup: AgeGroup; answers: Answers; current: number };

const DRAFT_KEY = "cattell-16pf-form-a-draft-v3";
const HISTORY_KEY = "cattell-16pf-form-a-history-v1";
const ageLabels: Record<AgeGroup, string> = {
  "16_18": "16–18 лет",
  "19_28": "19–28 лет",
  "29_70": "29–70 лет",
};
const sectionSize = 24;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function levelLabel(sten: number) {
  if (sten <= 3) return "левый полюс";
  if (sten >= 8) return "правый полюс";
  return "средний диапазон";
}

function resultPhrase(sten: number, low: string, high: string) {
  if (sten <= 3) return `В профиле заметнее полюс «${low.toLowerCase()}»`;
  if (sten >= 8) return `В профиле заметнее полюс «${high.toLowerCase()}»`;
  return "Показатель находится в среднем диапазоне";
}

function calculateProfile(answers: Answers, sex: Sex, ageGroup: AgeGroup): FactorResult[] {
  return factorMeta.map(({ code }) => {
    const raw = factorItems[code].reduce(
      (sum, id) => sum + (answers[id] ? itemScores[id][answers[id]] : 0),
      0,
    );
    return { code, raw, sten: rawToSten(code, raw, sex, ageGroup) };
  });
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [sex, setSex] = useState<Sex>("female");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("29_70");
  const [answers, setAnswers] = useState<Answers>({});
  const [current, setCurrent] = useState(0);
  const [history, setHistory] = useState<SavedResult[]>([]);
  const [activeResult, setActiveResult] = useState<SavedResult | null>(null);
  const [ready, setReady] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [linkSaved, setLinkSaved] = useState(false);
  const questionPanelRef = useRef<HTMLElement>(null);

  const questions = useMemo(() => getQuestions(sex), [sex]);
  const answeredCount = Object.keys(answers).length;
  const progress = Math.round((answeredCount / questions.length) * 100);
  const selected = answers[questions[current]?.id];
  const sectionCount = Math.ceil(questions.length / sectionSize);
  const currentSection = Math.floor(current / sectionSize);
  const sectionStart = currentSection * sectionSize;
  const sectionQuestions = questions.slice(sectionStart, sectionStart + sectionSize);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const storedHistory = localStorage.getItem(HISTORY_KEY);
        const storedDraft = localStorage.getItem(DRAFT_KEY);
        if (storedHistory) setHistory(JSON.parse(storedHistory));
        if (storedDraft) {
          const draft = JSON.parse(storedDraft) as Draft;
          setSex(draft.sex);
          setAgeGroup(draft.ageGroup);
          setAnswers(draft.answers ?? {});
          setCurrent(Math.min(draft.current ?? 0, 186));
        }
      } catch {
        // The test remains usable if storage is unavailable.
      } finally {
        setReady(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!ready || screen !== "test") return;
    try {
      if (answeredCount) {
        const draft: Draft = { sex, ageGroup, answers, current };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      }
    } catch {
      // Device-local saving is optional.
    }
  }, [ageGroup, answeredCount, answers, current, ready, screen, sex]);

  const factorGroups = useMemo(() => {
    if (!activeResult) return [];
    const groups = ["Общение", "Эмоции", "Мышление", "Саморегуляция"] as const;
    return groups.map((group) => ({
      group,
      factors: factorMeta
        .filter((factor) => factor.group === group)
        .map((factor) => ({
          ...factor,
          result: activeResult.factors.find((item) => item.code === factor.code)!,
        })),
    }));
  }, [activeResult]);

  const pronounced = useMemo(() => {
    if (!activeResult) return [];
    return activeResult.factors
      .map((result) => ({
        ...result,
        meta: factorMeta.find((factor) => factor.code === result.code)!,
        distance: Math.abs(result.sten - 5.5),
      }))
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 4);
  }, [activeResult]);

  function startTest() {
    setScreen("test");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseAnswer(value: OptionKey) {
    setAnswers((previous) => ({ ...previous, [questions[current].id]: value }));
  }

  function goToQuestion(index: number) {
    setCurrent(Math.max(0, Math.min(questions.length - 1, index)));
    setShowMap(false);
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 920px)").matches) {
        questionPanelRef.current?.scrollIntoView({ block: "start" });
      }
    });
  }

  function previous() {
    if (current > 0) goToQuestion(current - 1);
  }

  function next() {
    if (!selected) return;
    if (current < questions.length - 1) {
      goToQuestion(current + 1);
      return;
    }
    finish();
  }

  function finish() {
    if (answeredCount !== questions.length) {
      const firstMissing = questions.findIndex((question) => !answers[question.id]);
      if (firstMissing >= 0) goToQuestion(firstMissing);
      return;
    }
    const result: SavedResult = {
      id: `16pf-${Date.now()}`,
      date: new Date().toISOString(),
      sex,
      ageGroup,
      factors: calculateProfile(answers, sex, ageGroup),
    };
    const nextHistory = [result, ...history].slice(0, 12);
    setActiveResult(result);
    setHistory(nextHistory);
    setScreen("result");
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Device-local saving is optional.
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function restart() {
    if (answeredCount && screen !== "result" && !window.confirm("Начать заново? Сохранённые ответы текущего прохождения будут удалены.")) return;
    setAnswers({});
    setCurrent(0);
    setActiveResult(null);
    setScreen("setup");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Device-local saving is optional.
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openResult(item: SavedResult) {
    setActiveResult(item);
    setScreen("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteHistoryItem(id: string) {
    const nextHistory = history.filter((item) => item.id !== id);
    setHistory(nextHistory);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    } catch {
      // Device-local saving is optional.
    }
  }

  function clearHistory() {
    if (!window.confirm("Удалить всю сохранённую историю этого теста на устройстве?")) return;
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // Device-local saving is optional.
    }
  }

  async function saveLink() {
    const url = window.location.href.split(/[?#]/)[0];
    try {
      if (navigator.share) {
        await navigator.share({
          title: "16-факторный опросник Кеттелла",
          text: "Сохраните опросник, чтобы пройти его в удобное время.",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setLinkSaved(true);
        window.setTimeout(() => setLinkSaved(false), 2400);
      }
    } catch {
      // Closing the native share dialog needs no warning.
    }
  }

  return (
    <main className="assessment-app">
      <header className="assessment-header">
        <button className="test-name" type="button" onClick={() => setScreen(answeredCount ? "test" : "setup")}>
          <span className="test-code">16PF</span>
          <span>Личностный опросник Кеттелла</span>
        </button>
        <p className="header-purpose">Формирует профиль по 16 личностным факторам — от общения и эмоций до мышления и саморегуляции.</p>
        <div className="header-actions">
          <button className="save-header-button" type="button" onClick={saveLink}>{linkSaved ? "Ссылка сохранена" : "Сохранить тест"}</button>
          <button type="button" onClick={() => setShowMethod(true)}>О методике</button>
          <button type="button" onClick={() => setScreen("history")}>История <b>{history.length}</b></button>
        </div>
      </header>

      {screen === "setup" && (
        <section className="setup-view">
          <div className="setup-copy">
            <p className="micro-label">Форма A · 187 вопросов</p>
            <h1>16-факторный личностный опросник Кеттелла</h1>
            <p className="setup-lead">Последовательность вопросов складывается в профиль по 16 независимым шкалам. Здесь нет «хороших» и «плохих» ответов — важна первая естественная реакция.</p>
            <div className="setup-facts">
              <div><strong>35–50 минут</strong><span>лучше проходить без перерыва</span></div>
              <div><strong>16 факторов</strong><span>результат в стенах от 1 до 10</span></div>
              <div><strong>Локально</strong><span>ответы не отправляются на сервер</span></div>
            </div>
          </div>

          <div className="setup-card">
            <p className="micro-label">Перед началом</p>
            <h2>Выберите форму и возраст</h2>
            <p>Это нужно для грамматических формулировок и корректного перевода сырых баллов в стены.</p>

            <fieldset>
              <legend>Форма обращения</legend>
              <div className="choice-pair">
                <button className={sex === "female" ? "selected" : ""} type="button" onClick={() => setSex("female")}><i />Женская</button>
                <button className={sex === "male" ? "selected" : ""} type="button" onClick={() => setSex("male")}><i />Мужская</button>
              </div>
            </fieldset>

            <fieldset>
              <legend>Возрастная группа</legend>
              <div className="age-options">
                {(Object.keys(ageLabels) as AgeGroup[]).map((key) => (
                  <button className={ageGroup === key ? "selected" : ""} type="button" key={key} onClick={() => setAgeGroup(key)}>
                    <i />{ageLabels[key]}
                  </button>
                ))}
              </div>
            </fieldset>

            {answeredCount > 0 ? (
              <div className="resume-box">
                <span>Сохранено {answeredCount} из 187 ответов</span>
                <button className="primary-button" type="button" onClick={startTest}>Продолжить прохождение →</button>
                <button className="text-button" type="button" onClick={restart}>Начать заново</button>
              </div>
            ) : (
              <button className="primary-button start-button" type="button" onClick={startTest}>Начать тест <span>→</span></button>
            )}
            <small className="setup-note">Для надёжного профиля отвечайте самостоятельно и не задерживайтесь надолго на одном пункте.</small>
          </div>
        </section>
      )}

      {screen === "test" && (
        <>
          <section className="mobile-intro">
            <p className="micro-label">16PF · 187 вопросов · прогресс сохраняется</p>
            <h1>Выбирайте ответ, который первым кажется вам наиболее точным</h1>
            <p>Не ищите социально желательный вариант. Если ни один ответ не подходит идеально, выберите ближайший.</p>
          </section>

          <div className="test-layout">
            <aside className="test-sidebar">
              <div className="sidebar-copy">
                <p className="micro-label">Как отвечать</p>
                <h1>Первая реакция обычно точнее</h1>
                <p>Выберите один из трёх вариантов. Если сомневаетесь, отметьте средний ответ или ближайший по смыслу.</p>
              </div>

              <div className="test-status">
                <div className="status-head"><span>Заполнено</span><strong>{answeredCount} / {questions.length}</strong></div>
                <div className="status-bar"><i style={{ width: `${progress}%` }} /></div>
                <span className="status-percent">{progress}%</span>
              </div>

              <div className="section-tabs" aria-label="Разделы вопросов">
                {Array.from({ length: sectionCount }, (_, section) => {
                  const start = section * sectionSize;
                  const end = Math.min(start + sectionSize, questions.length);
                  const complete = questions.slice(start, end).every((question) => answers[question.id]);
                  return (
                    <button
                      type="button"
                      key={section}
                      className={`${section === currentSection ? "current" : ""} ${complete ? "complete" : ""}`}
                      onClick={() => goToQuestion(start)}
                      aria-label={`Вопросы ${start + 1}–${end}`}
                    >
                      {section + 1}
                    </button>
                  );
                })}
              </div>

              <div className="question-map" aria-label="Вопросы текущего раздела">
                {sectionQuestions.map((question) => {
                  const index = question.id - 1;
                  return (
                    <button
                      type="button"
                      key={question.id}
                      className={`${index === current ? "current" : ""} ${answers[question.id] ? "answered" : ""}`}
                      onClick={() => goToQuestion(index)}
                    >
                      {question.id}
                    </button>
                  );
                })}
              </div>

              <div className="sidebar-notes">
                <p><strong>Можно сделать паузу</strong>Текущий прогресс автоматически сохраняется на этом устройстве.</p>
                <p className="privacy-note"><span>●</span> Ответы остаются в этом браузере.</p>
              </div>
            </aside>

            <section className="question-panel" ref={questionPanelRef}>
              <div className="question-topline">
                <span>Вопрос {current + 1}</span>
                <span>из {questions.length}</span>
              </div>

              <div className="question-body">
                <h2>{questions[current].prompt}</h2>
                <p className="answer-prompt">Выберите один вариант</p>
                <div className="response-list" role="radiogroup" aria-label="Варианты ответа">
                  {questions[current].options.map((label, index) => {
                    const value = (["a", "b", "c"] as OptionKey[])[index];
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected === value}
                        className={`response-${index} ${selected === value ? "selected" : ""}`}
                        key={value}
                        onClick={() => chooseAnswer(value)}
                      >
                        <span className="response-number">{index + 1}</span>
                        <span className="radio-mark" aria-hidden="true"><i /></span>
                        <span className="response-copy"><strong>{label}</strong></span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="question-controls">
                <button className="back-control" type="button" disabled={current === 0} onClick={previous}>← Назад</button>
                <button className="map-control" type="button" onClick={() => setShowMap(true)}>Карта вопросов</button>
                <span className="save-state">{selected ? "Ответ сохранён" : "Ответ не выбран"}</span>
                <button className="next-control" type="button" disabled={!selected} onClick={next}>
                  {current === questions.length - 1 ? "Завершить" : "Следующий вопрос"} <span>→</span>
                </button>
              </div>
            </section>
          </div>
        </>
      )}

      {screen === "result" && activeResult && (
        <section className="result-view">
          <div className="result-heading">
            <div>
              <p className="micro-label">Ваш профиль · 16 факторов</p>
              <h1>Не один тип, а сочетание особенностей</h1>
              <p>Каждая шкала независима. Крайние значения показывают более выраженный полюс, а средние — гибкость между двумя способами реагирования.</p>
            </div>
            <div className="profile-stamp"><strong>16</strong><span>факторов<br />в профиле</span></div>
          </div>

          <div className="profile-summary">
            <p className="micro-label">Наиболее заметные особенности</p>
            <div>
              {pronounced.map(({ code, sten, meta }) => (
                <article key={code}>
                  <span>{code} · {meta.name}</span>
                  <strong>{sten <= 3 ? meta.low : sten >= 8 ? meta.high : "Средний диапазон"}</strong>
                  <small>{sten} стен</small>
                </article>
              ))}
            </div>
          </div>

          <div className="factor-groups">
            {factorGroups.map(({ group, factors }) => (
              <section className="factor-group" key={group}>
                <div className="group-heading"><p className="micro-label">{group}</p><span>1–10 стенов</span></div>
                <div className="factor-list">
                  {factors.map(({ code, name, low, high, result }) => (
                    <article className="factor-row" key={code}>
                      <div className="factor-title"><b>{code}</b><div><strong>{name}</strong><small>{resultPhrase(result.sten, low, high)}</small></div></div>
                      <div className="factor-scale" aria-label={`${name}: ${result.sten} стен`}>
                        <div className="factor-poles"><span>{low}</span><span>{high}</span></div>
                        <div className="sten-track">
                          {Array.from({ length: 10 }, (_, index) => <i key={index} className={index + 1 === result.sten ? "active" : ""} />)}
                          <em style={{ left: `${((result.sten - 1) / 9) * 100}%` }}>{result.sten}</em>
                        </div>
                        <div className="sten-ends"><span>1</span><span>10</span></div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="result-note">
            <strong>Как читать результат</strong>
            <p>1–3 стена — заметнее левый полюс шкалы, 4–7 — средний диапазон, 8–10 — правый полюс. Это описание профиля, а не оценка качеств как «лучших» или «худших».</p>
          </div>

          <div className="clinical-disclaimer">
            <strong>Это не диагноз</strong>
            <p>Опросник описывает личностные тенденции и не заменяет профессиональную психодиагностику. Интерпретировать отдельные шкалы лучше в контексте всего профиля и жизненной ситуации.</p>
          </div>

          <div className="result-buttons">
            <button className="primary-button" type="button" onClick={() => window.print()}>Распечатать профиль</button>
            <button type="button" onClick={() => setScreen("history")}>Посмотреть историю</button>
            <button type="button" onClick={restart}>Пройти заново</button>
          </div>
          <p className="retest-note">Полный 16PF не предназначен для еженедельного мониторинга. Повторное прохождение имеет смысл спустя несколько месяцев или после заметных жизненных изменений.</p>
        </section>
      )}

      {screen === "history" && (
        <section className="history-view">
          <div className="history-heading">
            <div>
              <p className="micro-label">Локальная история</p>
              <h1>Сохранённые профили</h1>
              <p>Здесь остаются только завершённые прохождения в этом браузере. Можно открыть любой профиль или удалить отдельную запись.</p>
            </div>
            <button type="button" onClick={() => setScreen(answeredCount ? "test" : "setup")}>Вернуться к тесту →</button>
          </div>

          {!history.length ? (
            <div className="history-empty"><strong>Профилей пока нет</strong><p>Завершённое прохождение автоматически появится здесь.</p></div>
          ) : (
            <div className="history-cards">
              {history.map((item) => {
                const extremes = item.factors
                  .map((factor) => ({ ...factor, distance: Math.abs(factor.sten - 5.5) }))
                  .sort((a, b) => b.distance - a.distance)
                  .slice(0, 4);
                return (
                  <article key={item.id}>
                    <button className="history-open" type="button" onClick={() => openResult(item)}>
                      <time>{formatDate(item.date)}</time>
                      <strong>Профиль 16PF</strong>
                      <span>{item.sex === "female" ? "Женская форма" : "Мужская форма"} · {ageLabels[item.ageGroup]}</span>
                      <div className="mini-profile">
                        {extremes.map((factor) => <i key={factor.code} style={{ height: `${factor.sten * 10}%` }} title={`${factor.code}: ${factor.sten}`} />)}
                      </div>
                    </button>
                    <button className="delete-entry" type="button" onClick={() => deleteHistoryItem(item.id)} aria-label={`Удалить профиль от ${formatDate(item.date)}`} title="Удалить эту запись">
                      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 6.5h9m-7-2h5m-6.2 2 .7 9h6l.7-9M8.7 9v4m2.6-4v4" /></svg>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
          {!!history.length && <button className="clear-button" type="button" onClick={clearHistory}>Удалить всю историю на устройстве</button>}
        </section>
      )}

      {showMap && (
        <div className="modal-backdrop map-backdrop">
          <section className="map-modal" role="dialog" aria-modal="true" aria-labelledby="map-title">
            <button className="modal-close" type="button" onClick={() => setShowMap(false)} aria-label="Закрыть">×</button>
            <p className="micro-label">Навигация</p>
            <h2 id="map-title">Карта вопросов</h2>
            <div className="full-question-map">
              {questions.map((question, index) => (
                <button
                  type="button"
                  key={question.id}
                  className={`${index === current ? "current" : ""} ${answers[question.id] ? "answered" : ""}`}
                  onClick={() => goToQuestion(index)}
                >
                  {question.id}
                </button>
              ))}
            </div>
            <p className="map-legend"><i /> отвечено <i /> текущий вопрос</p>
          </section>
        </div>
      )}

      {showMethod && (
        <div className="modal-backdrop">
          <section className="info-modal" role="dialog" aria-modal="true" aria-labelledby="method-title">
            <button className="modal-close" type="button" onClick={() => setShowMethod(false)} aria-label="Закрыть">×</button>
            <p className="micro-label">16PF · форма A</p>
            <h2 id="method-title">О методике и расчёте</h2>
            <p>Опросник Рэймонда Кеттелла описывает личность через 16 первичных факторов. В форме A — 187 пунктов с тремя вариантами ответа.</p>
            <p>Ответы переводятся в сырые баллы по ключу каждой шкалы, а затем — в стандартные стены от 1 до 10 с учётом выбранной возрастной и половой группы.</p>
            <dl>
              <div><dt>Объём</dt><dd>187 вопросов</dd></div>
              <div><dt>Результат</dt><dd>16 независимых шкал</dd></div>
              <div><dt>Диапазон</dt><dd>1–10 стенов по каждой шкале</dd></div>
              <div><dt>Время</dt><dd>примерно 35–50 минут</dd></div>
            </dl>
            <p className="modal-note">Это рабочая цифровая реализация русскоязычной формы A. Она подходит для ориентирующего знакомства с профилем, но не является официальным отчётом правообладателя и не заменяет работу специалиста.</p>
            <div className="method-links">
              <a href="https://psytests.org/multi/cat16pfA.html" target="_blank" rel="noreferrer">Описание формы A</a>
              <a href="https://psylist.net/praktikum/kettell2-htm" target="_blank" rel="noreferrer">Ключ шкал</a>
              <a href="https://psylist.net/praktikum/kettell4.htm" target="_blank" rel="noreferrer">Нормативные таблицы</a>
            </div>
            <button className="primary-button" type="button" onClick={() => setShowMethod(false)}>Понятно</button>
          </section>
        </div>
      )}
    </main>
  );
}

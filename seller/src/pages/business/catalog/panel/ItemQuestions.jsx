import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatDateTime } from "@epicmkt/shared";
import * as api from "../../../../api/index.js";
import { errorText } from "../../../../lib/errors.js";
import ui from "../../../../styles/ui.module.css";
import { ReplyForm, STATUS } from "../../Questions.jsx";
import styles from "./panel.module.css";

export default function ItemQuestions({ item, readOnly }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["questions"], queryFn: api.listQuestions });
  if (list.isPending) return <div className={styles.skeletonStack} aria-busy="true" data-testid="questions-skeleton"><span className={styles.skeletonRow} /><span className={styles.skeletonRow} /></div>;
  if (list.isError && !list.data) {
    return (
      <div className={`${ui.banner} ${ui.tone_danger}`} role="alert">
        <h2>We could not load the questions</h2>
        <p>{errorText(list.error)}</p>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => list.refetch()}>Try again</button>
      </div>
    );
  }
  const mine = (list.data ?? []).filter((q) => q.itemId === item.id);
  const done = () => qc.invalidateQueries({ queryKey: ["questions"] });
  return (
    <section className={styles.stack} aria-labelledby="panel-questions">
      <h3 id="panel-questions" className={styles.h3}>Questions about this item</h3>
      {mine.length === 0 && <p className={styles.note} data-testid="questions-empty">No one has asked about this item.</p>}
      <ul className={styles.deals}>
        {mine.map((q) => {
          const tone = STATUS[q.status] ?? STATUS.open;
          return (
            <li key={q.id} className={styles.deal}>
              <div className={styles.rowBetween}>
                <span className={styles.chip}>{tone.label}</span>
                <span className={styles.muted}>{formatDateTime(q.createdAt)}</span>
              </div>
              <p className={styles.quote}>{q.message}</p>
              {q.reply && <p className={styles.reply}><strong>Your answer:</strong> {q.reply}</p>}
              {q.status === "open" && !readOnly && <ReplyForm q={q} onDone={done} />}
            </li>
          );
        })}
      </ul>
      <Link className={`${ui.link} ${styles.moreLink}`} to="/business/questions">Open all questions</Link>
    </section>
  );
}

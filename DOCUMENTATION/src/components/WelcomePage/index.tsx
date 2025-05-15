import React from 'react';
import styles from './styles.module.css';

export default function WelcomePage() {
  return (
    <section className={styles.welcome}>
      <div className={styles.heroContent}>
        <h1>Full PHP development environment on Docker</h1>
      </div>
      <div className={styles.overlay} />
    </section>
  );
}

<template>
  <section class="page-section">
    <header class="page-header">
      <div>
        <p class="eyebrow">Settings</p>
        <h1>Reserved For Integration Settings</h1>
      </div>
      <p class="support-copy">
        Authentication, environment targets, and runtime integration switches will land here after upstream contracts harden.
      </p>
    </header>

    <section class="placeholder-card">
      <p>
        This route exists now so the shell and navigation do not need to change later when environment and integration controls arrive.
      </p>
    </section>
  </section>
</template>

<style scoped>
@import './shared-page.css';

.placeholder-card {
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  color: var(--color-text-muted);
  line-height: 1.7;
}

.placeholder-card p {
  margin: 0;
}
</style>

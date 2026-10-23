// One content mutation at a time. The Manager shows a busy state, but the main
// process is authoritative: import, sync, publish, delete, and removal all
// acquire this lock so a second window or a stale renderer cannot interleave.

const createMutationLock = () => {
  let owner = null;

  return {
    acquire(name) {
      if (owner) return { ok: false, owner };

      owner = name;
      let released = false;

      return {
        ok: true,
        release() {
          if (released) return;
          released = true;
          if (owner === name) owner = null;
        },
      };
    },
    current() {
      return owner;
    },
  };
};

module.exports = { createMutationLock };

# Contributing to StackRank Character Base Data

## Scope of changes
No change is too small to be considered a worthwhile contribution! Even if you're only
changing one line of code, it can save time and bring value to the tool faster than if
you don't contribute. Go for it!

If you want to change a very large section of the code, then expect some
back-and-forth before your pull request is accepted. It means that I'm interested in
what you're doing and want to make it as good as possible - not that I'm trying to
prevent you from contributing. 

## Getting started
To get started contributing to the mods optimizer, first fork the repository. Once
you have your own copy of the repository, start making changes and committing them to
a new branch (or to your own `main` branch, if you wish). Once your changes are
ready, open up a pull request back to the original repository.

## Commit messages
Commit messages should follow the format of:
```
Simple description of change (<50 characters)

Longer description (if necessary) of what changed, and why. Also include any caveats
for the new code or known issues / incomplete sections.
```

This makes changes easy to parse from just reading the commit log.

## Pull requests
Once you think that your changes are ready to be merged, open a pull request back to
the `main` branch on `NducTiOnomBi/swgoh-stackrank`. This will notify me that the
changes are ready, and will start the review process.

Once a change has been committed, any changes to the characterBaseData.json will be migrated to the main repo, and a new dev build/deployment will be initiated.

After the successful dev build/deployment, the change will be promoted and a new pubic build/deployment will be initiated, at which point all users will have access to the changes.


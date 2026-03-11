# Contributing

## Scope

This repository is workflow-only.

Allowed content:

- vibecoding workflow prompts
- session templates
- project bootstrap scripts
- reference docs for process, testing, and output shape

Not allowed:

- business source code
- business data
- feature-specific runtime logic
- product assets copied from other projects

## Update Rule

When updating this repository:

1. keep templates generic
2. do not embed project-specific paths except placeholders
3. validate the bootstrap script by generating a sample project
4. avoid changes that require past conversation context to use

## Validation

Before commit:

- check generated files exist
- check template placeholders are replaced
- check the generated project can be initialized as its own git repo

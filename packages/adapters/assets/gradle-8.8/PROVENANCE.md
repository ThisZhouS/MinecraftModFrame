# Gradle wrapper assets (Gradle 8.8)

These three files are shipped verbatim into every generated project so it builds without a
globally installed Gradle:

- `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`

Provenance: produced by Gradle's own `wrapper` task, run with the unmodified Gradle 8.8
distribution downloaded from https://services.gradle.org/distributions/gradle-8.8-bin.zip:

```
gradle wrapper --gradle-version 8.8 --distribution-type bin --no-validate-url
```

Gradle and the wrapper jar are licensed under the Apache License 2.0
(https://github.com/gradle/gradle/blob/master/LICENSE). The wrapper jar is explicitly intended
to be committed into and redistributed with projects.

Why a second wrapper version exists: ForgeGradle 6 (used by the Forge 1.20.1 adapter) is not
compatible with Gradle 9, so the Forge adapter pins the Gradle 8.8 wrapper that the official
Forge 1.20.1 MDK ships.

`gradle-wrapper.properties` is NOT copied from here: each generated project renders it from the
adapter template so the distribution URL is data, not a binary blob.

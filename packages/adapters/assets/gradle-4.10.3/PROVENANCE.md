# Gradle wrapper assets (Gradle 4.10.3)

These three files are shipped verbatim into every generated project so it builds without a
globally installed Gradle:

- `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`

Provenance: produced by Gradle's own `wrapper` task, run with the unmodified Gradle 4.10.3
distribution downloaded from https://services.gradle.org/distributions/gradle-4.10.3-bin.zip:

```
gradle wrapper --gradle-version 4.10.3 --distribution-type bin
```

Gradle and the wrapper jar are licensed under the Apache License 2.0
(https://github.com/gradle/gradle/blob/master/LICENSE). The wrapper jar is explicitly intended
to be committed into and redistributed with projects.

Why this version exists: Minecraft 1.12.2 needs ForgeGradle 3, which is not compatible with
Gradle 8 or 9. The official 1.12.x MDK pins the Gradle 4.x line, so the 1.12.2 adapter ships the
matching wrapper. This is the only target in the repo on Gradle 4; it also needs a Java 8 daemon
(Gradle 4.10.3 does not run on Java 9+).

`gradle-wrapper.properties` is NOT copied from here: each generated project renders it from the
adapter template so the distribution URL is data, not a binary blob. Note that the 1.12.2
adapter's template uses the pre-Gradle-5 key set (no `networkTimeout`/`validateDistributionUrl`,
which the old wrapper does not read).

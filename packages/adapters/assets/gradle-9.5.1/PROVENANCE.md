# Gradle wrapper assets (Gradle 9.5.1)

These four files are shipped verbatim into every generated project so it builds without a
globally installed Gradle:

- `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`

Provenance: produced by Gradle's own `wrapper` task, run with the unmodified Gradle 9.5.1
distribution downloaded from https://services.gradle.org/distributions/gradle-9.5.1-bin.zip:

```
gradle wrapper --gradle-version 9.5.1 --distribution-type bin --no-validate-url
```

Gradle and the wrapper jar are licensed under the Apache License 2.0
(https://github.com/gradle/gradle/blob/master/LICENSE). The wrapper jar is explicitly intended
to be committed into and redistributed with projects.

`gradle-wrapper.properties` is NOT copied from here: each generated project renders it from the
adapter template so the distribution URL is data, not a binary blob.

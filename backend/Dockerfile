# Build stage: compiles the app and unpacks the jar so dependencies and app code sit in separate image layers.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /build
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -q -B dependency:go-offline
COPY src src
RUN ./mvnw -q -B package -DskipTests \
 && java -Djarmode=tools -jar target/*.jar extract --destination /build/out

# Run stage: just a JRE, running as a normal user.
FROM eclipse-temurin:25-jre
RUN useradd --system --uid 10001 ticketrush \
 # The base image ships Pebble, a service supervisor written in Go. This container runs java directly and never uses it,
 # and an unused program is only something to keep patched (a scan found two high findings in its Go libraries).
 && rm -f /usr/bin/pebble
WORKDIR /app
COPY --from=build /build/out/lib ./lib
COPY --from=build /build/out/*.jar ./app.jar
USER ticketrush
EXPOSE 8080 8081
# Size the heap from the container's memory limit, not the host's.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70"
ENTRYPOINT ["java", "-jar", "app.jar"]

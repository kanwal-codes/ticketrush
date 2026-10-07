# Build stage: compiles the app and unpacks the jar so dependencies and app code sit in separate image layers.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -q -B dependency:go-offline
COPY src src
RUN ./mvnw -q -B package -DskipTests \
 && java -Djarmode=tools -jar target/*.jar extract --destination /build/out

# Run stage: just a JRE, running as a normal user.
FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 ticketrush
WORKDIR /app
COPY --from=build /build/out/lib ./lib
COPY --from=build /build/out/*.jar ./app.jar
USER ticketrush
EXPOSE 8080 8081
# Size the heap from the container's memory limit, not the host's.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70"
ENTRYPOINT ["java", "-jar", "app.jar"]

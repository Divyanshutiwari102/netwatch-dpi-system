# ─── Stage 1: Build ───────────────────────────────────────────────
FROM maven:3.9.6-eclipse-temurin-17 AS build

WORKDIR /app

# backend/ folder se copy karo
COPY backend/pom.xml .
RUN mvn dependency:go-offline -B

COPY backend/src ./src
RUN mvn clean package -DskipTests -Dmaven.test.skip=true

# ─── Stage 2: Run ─────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

COPY --from=build /app/target/netwatch-backend.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]

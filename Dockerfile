# ─── Stage 1: Build ───────────────────────────────────────────────
FROM maven:3.9.6-eclipse-temurin-17 AS build

WORKDIR /app

COPY backend/pom.xml .
RUN mvn dependency:go-offline -B

COPY backend/src ./src
RUN mvn clean package -Dmaven.test.skip=true

# ─── Stage 2: Run ─────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-alpine

RUN apk add --no-cache libpcap

WORKDIR /app

COPY --from=build /app/target/netwatch-backend.jar app.jar

# ← YE LINE ADD KI HAI
COPY sample-data/demo.pcap /app/sample-data/demo.pcap

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
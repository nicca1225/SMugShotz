FROM rabbitmq:3.13-management

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    curl -fsSL https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/v3.13.0/rabbitmq_delayed_message_exchange-3.13.0.ez \
    -o /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange-3.13.0.ez && \
    rabbitmq-plugins enable rabbitmq_delayed_message_exchange && \
    apt-get remove -y curl && apt-get autoremove -y && apt-get clean

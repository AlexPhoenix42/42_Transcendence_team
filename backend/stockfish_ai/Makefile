CXX       := g++
CXXFLAGS  := -std=c++17 -O2 -Wall -Wextra -Werror -Iincs -MMD -MP
LDFLAGS   := -static -pthread

TARGET    := bin/stockfish_ai_wrapper
SOURCES   := srcs/main.cpp
OBJECTS   := objs/main.o
DEPS      := $(OBJECTS:.o=.d)

.PHONY: all clean

all: $(TARGET)

objs/%.o: srcs/%.cpp
	@mkdir -p objs
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(TARGET): $(OBJECTS)
	@mkdir -p bin
	$(CXX) $(OBJECTS) -o $(TARGET) $(LDFLAGS)

-include $(DEPS)

clean:
	rm -rf objs
	-rm -rf bin/*

